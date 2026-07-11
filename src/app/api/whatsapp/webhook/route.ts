export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { processMessage, BotAdapter, registerFallbackRows } from '@/app/lib/botEngine';
import { BookingSource } from '@prisma/client';
import { logger } from '@/app/lib/logger';
import { generateWebhookId, getOrCreateCorrelationId } from '@/app/lib/correlation';
import { isDuplicateMessage } from '@/app/lib/duplicateGuard';
import { fetchWithRetry } from '@/app/lib/retry';
import { trackEvent } from '@/app/lib/conversationTracker';
import { metrics } from '@/app/lib/metrics';
import { required } from '@/app/lib/env';
import { validateWaPayload, parseMetaError } from '@/app/lib/metaValidation';

const WHATSAPP_TOKEN = required('WHATSAPP_TOKEN');
const WHATSAPP_PHONE_ID = required('WHATSAPP_PHONE_ID');

const WA_URL = () => `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`;
const WA_HEADERS = () => ({
  Authorization: `Bearer ${WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json',
});

async function callMetaApi(url: string, headers: Record<string, string>, payload: unknown, cid: string): Promise<Response> {
  const start = Date.now();
  const body = JSON.stringify(payload);
  const res = await fetchWithRetry(url, { method: 'POST', headers, body }, cid);
  const duration = Date.now() - start;
  metrics.metaApiLatency.observe(duration);

      const resBody = res.ok ? '' : await res.text().catch(() => '');
      const metaErr = resBody ? parseMetaError(resBody) : undefined;
      logger.info('[MetaAPI] WhatsApp sent', {
        correlationId: cid, duration, status: res.status, ok: res.ok,
        error: resBody || undefined,
        ...(metaErr ? { metaCode: metaErr.code, metaType: metaErr.type, metaMessage: metaErr.message, metaTrace: metaErr.fbtraceId } : {}),
      });

  return res;
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    logger.error('WHATSAPP_APP_SECRET not set — rejecting webhook');
    return false;
  }
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  try {
    const sigBuf = Buffer.from(signatureHeader);
    const expBuf = Buffer.from(expected);
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

function makeWhatsAppAdapter(cid: string): BotAdapter {
  return {
    async sendText(to, text) {
      const payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
      try {
        const res = await callMetaApi(WA_URL(), WA_HEADERS(), payload, cid);
        if (!res.ok) logger.error('WA sendText failed', { status: res.status, correlationId: cid });
      } catch (err) {
        logger.error('WA sendText error', { error: String(err), correlationId: cid });
      }
    },

    async sendList(to, header, body, button, sections) {
      const interactivePayload = {
        type: 'list',
        header: { type: 'text', text: header },
        body: { text: body },
        footer: { text: 'SmartClinic 🏥' },
        action: { button, sections },
      };
      validateWaPayload(interactivePayload);

      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: interactivePayload,
      };

      try {
        const res = await callMetaApi(WA_URL(), WA_HEADERS(), payload, cid);
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          const metaErr = parseMetaError(errBody);
          logger.error('WA sendList rejected by Meta', {
            status: res.status, error: errBody, correlationId: cid,
            ...(metaErr ? { metaCode: metaErr.code, metaType: metaErr.type, metaMessage: metaErr.message, metaTrace: metaErr.fbtraceId } : {}),
          });
          throw new Error(errBody);
        }
      } catch (err) {
        const rows = sections.flatMap(s => s.rows);
        await registerFallbackRows(to, rows);
        logger.warn('WA sendList failed, falling back to plain text', {
          error: String(err), correlationId: cid, rowCount: rows.length,
        });
        const items = rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
        const fallback = `${body}\n\n${items}\n\nأرسل رقم اختيارك / Send the number of your choice.`;
        await this.sendText(to, fallback);
      }
    },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  logger.info('WhatsApp webhook GET (verification)', { mode, tokenMatch: token === process.env.WHATSAPP_VERIFY_TOKEN });

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const webhookStart = Date.now();
  const webhookId = generateWebhookId();

  const rawBody = await req.text().catch(() => '');
  let body: any = null;
  try { body = JSON.parse(rawBody); } catch { /* invalid JSON */ }

  if (!verifySignature(rawBody, req.headers.get('X-Hub-Signature-256'))) {
    logger.warn('WhatsApp webhook — invalid signature', { webhookId });
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const entry     = body?.entry?.[0];
    const changes   = entry?.changes?.[0];
    const messages  = changes?.value?.messages ?? [];
    const metadata  = changes?.value?.metadata ?? {};

    // Use phone_number_id as part of the webhook dedup key
    const webhookDedupKey = `${entry?.id || ''}:${changes?.field || ''}:${metadata?.phone_number_id || ''}`;

    if (!messages.length) {
      return new Response('OK', { status: 200 });
    }

    metrics.whatsappWebhooksTotal.inc();
    metrics.whatsappWebhookLatency.observe(Date.now() - webhookStart);

    const adapter = makeWhatsAppAdapter(webhookId);
    logger.info('WhatsApp webhook POST', {
      messageCount: messages.length, webhookId, webhookDedupKey,
      duration: Date.now() - webhookStart,
    });

    for (const message of messages) {
      const msgStart = Date.now();
      const phone = message.from as string;
      const messageId = (message.id || message.wamid?.id || '') as string;

      const userInput: string =
        message.type === 'text' ? (message.text?.body ?? '').trim() :
        message.type === 'interactive'
          ? (message.interactive?.list_reply?.id ?? message.interactive?.button_reply?.id ?? '')
          : '';

      if (!userInput) continue;

      const correlationId = getOrCreateCorrelationId(webhookId);
      const isTextMessage = message.type === 'text';

      if (messageId) {
        const dup = await isDuplicateMessage(messageId, 'whatsapp', phone, correlationId);
        if (dup) {
          metrics.whatsappDuplicates.inc();
          logger.info('[Webhook] Duplicate skipped', { messageId, phone, webhookId, correlationId });
          trackEvent({
            conversationId: `conv_${phone}`,
            userId: phone,
            platform: 'whatsapp',
            eventType: 'DUPLICATE_SKIPPED',
            payloadId: userInput,
            isText: isTextMessage,
            success: true,
            correlationId,
            messageId,
            webhookId,
          }).catch(() => {});
          continue;
        }
      }

      logger.debug('Processing WhatsApp message', {
        phone, type: message.type, userInput, isText: isTextMessage,
        messageId, correlationId, webhookId,
      });

      try {
        await processMessage(
          phone, userInput, adapter,
          BookingSource.whatsapp, isTextMessage,
          correlationId, messageId, webhookId
        );
      } catch (err) {
        logger.error('processMessage error', {
          error: String(err), phone, userInput, correlationId, webhookId,
        });
      }

      metrics.whatsappMessagesProcessed.inc();
      logger.trace('[Webhook] message processed', {
        phone, userInput, duration: Date.now() - msgStart, correlationId,
      });
    }
  } catch (err) {
    logger.error('WhatsApp webhook error', {
      error: String(err), webhookId, duration: Date.now() - webhookStart,
    });
  }

  return new Response('OK', { status: 200 });
}
