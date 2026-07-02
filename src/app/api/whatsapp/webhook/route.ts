export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { processMessage, BotAdapter } from '@/app/lib/botEngine';
import { BookingSource } from '@prisma/client';
import { logger } from '@/app/lib/logger';
import { generateWebhookId, getOrCreateCorrelationId } from '@/app/lib/correlation';
import { isDuplicateMessage } from '@/app/lib/duplicateGuard';
import { fetchWithRetry } from '@/app/lib/retry';
import { trackEvent } from '@/app/lib/conversationTracker';
import { metrics } from '@/app/lib/metrics';

const WA_URL = () => `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const WA_HEADERS = () => ({
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json',
});

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
      const start = Date.now();
      try {
        const res = await fetchWithRetry(WA_URL(), {
          method: 'POST',
          headers: WA_HEADERS(),
          body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
        }, cid);
        metrics.metaApiLatency.observe(Date.now() - start);
        if (!res.ok) logger.error('WA sendText failed', { status: res.status, body: await res.text(), correlationId: cid });
      } catch (err) {
        metrics.metaApiLatency.observe(Date.now() - start);
        logger.error('WA sendText error', { error: String(err), correlationId: cid });
      }
    },

    async sendList(to, header, body, button, sections) {
      const start = Date.now();
      try {
        const res = await fetchWithRetry(WA_URL(), {
          method: 'POST',
          headers: WA_HEADERS(),
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'interactive',
            interactive: {
              type: 'list',
              header: { type: 'text', text: header },
              body: { text: body },
              footer: { text: 'SmartClinic 🏥' },
              action: { button, sections },
            },
          }),
        }, cid);
        metrics.metaApiLatency.observe(Date.now() - start);
        if (!res.ok) throw new Error(await res.text());
      } catch (err) {
        metrics.metaApiLatency.observe(Date.now() - start);
        logger.warn('WA sendList failed, falling back to plain text', { error: String(err), correlationId: cid });
        const items = sections.flatMap(s => s.rows).map((r, i) => `${i + 1}. ${r.title}`).join('\n');
        await this.sendText(to, `${body}\n\n${items}\n\nأرسل رقم اختيارك / Send the number of your choice.`);
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
