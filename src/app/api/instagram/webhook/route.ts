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
import { META_LIMITS, igQuickReplyTitle, parseMetaError, type MetaErrorInfo } from '@/app/lib/metaValidation';

const INSTAGRAM_TOKEN = required('INSTAGRAM_TOKEN');

function logTokenDiagnostic(): void {
  const prefix = INSTAGRAM_TOKEN.length >= 3 ? INSTAGRAM_TOKEN.slice(0, 3) : '???';
  logger.info('[Instagram] Token diagnostic', {
    length: INSTAGRAM_TOKEN.length,
    prefix,
    looksLikePageToken: prefix === 'EAA',
    looksLikeIgToken: prefix === 'IGQ',
    isEmpty: INSTAGRAM_TOKEN.length === 0,
  });
}
logTokenDiagnostic();

const IG_URL = () => `https://graph.facebook.com/v21.0/me/messages`;
const IG_HEADERS = () => ({
  Authorization: `Bearer ${INSTAGRAM_TOKEN}`,
  'Content-Type': 'application/json',
});

function formatMetaError(err: MetaErrorInfo): Record<string, unknown> {
  return {
    code: err.code,
    subcode: err.errorSubcode,
    type: err.type,
    message: err.message,
    errorUserTitle: err.errorUserTitle,
    errorUserMsg: err.errorUserMsg,
    details: err.details,
    fbtraceId: err.fbtraceId,
  };
}

function logMetaFailure(status: number, metaErr: MetaErrorInfo | undefined, cid: string): void {
  const base: Record<string, unknown> = { status, correlationId: cid };
  if (metaErr) {
    base.meta = formatMetaError(metaErr);
  }
  if (status === 401) {
    const hints: string[] = [];
    hints.push('expired Page Token');
    hints.push('wrong Facebook Page');
    hints.push('missing instagram_manage_messages permission');
    hints.push('Page disconnected from Instagram');
    hints.push('token has wrong type (not a Page Access Token)');
    if (metaErr?.errorSubcode === 190) hints.push('token expired or invalidated');
    if (metaErr?.errorSubcode === 460) hints.push('token invalidated by password change');
    base.likelyCauses = hints;
    logger.error('[MetaAPI] Instagram 401 — token rejected', base);
  } else if (status === 403) {
    base.likelyCauses = 'App may not have Advanced Access for instagram_manage_messages';
    logger.error('[MetaAPI] Instagram 403 — permission denied', base);
  } else {
    logger.error('[MetaAPI] Instagram API error', base);
  }
}

async function callMetaApi(url: string, headers: Record<string, string>, payload: unknown, cid: string): Promise<Response> {
  const start = Date.now();
  const body = JSON.stringify(payload);
  logger.debug('[MetaAPI] Instagram outgoing request', {
    correlationId: cid, url: url.slice(0, 80), payloadSize: body.length, payload: body.slice(0, 2000),
  });
  const res = await fetchWithRetry(url, { method: 'POST', headers, body }, cid);
  const duration = Date.now() - start;
  metrics.metaApiLatency.observe(duration);

  const resBody = res.ok ? '' : await res.clone().text().catch(() => '');
  const metaErr = resBody ? parseMetaError(resBody) : undefined;
  if (res.ok) {
    logger.info('[MetaAPI] Instagram reply sent', {
      correlationId: cid, duration, status: res.status,
    });
  } else {
    logMetaFailure(res.status, metaErr ?? undefined, cid);
  }

  return res;
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {

  if (!signatureHeader) return false;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    logger.error('INSTAGRAM_APP_SECRET not set — rejecting webhook');
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

function makeInstagramAdapter(cid: string): BotAdapter {
  return {
    async sendText(to, text) {
      // Strip ig_ prefix to get raw PSID for Meta API
      const recipientId = to.replace(/^ig_/, '');
      const payload = { messaging_type: 'RESPONSE', recipient: { id: recipientId }, message: { text } };
      try {
        const res = await callMetaApi(IG_URL(), IG_HEADERS(), payload, cid);
        if (!res.ok) {
          const errBody = await res.clone().text().catch(() => '');
          const metaErr = errBody ? parseMetaError(errBody) : undefined;
          logMetaFailure(res.status, metaErr ?? undefined, cid);
          const msg = metaErr?.message || `Instagram sendText failed with status ${res.status}`;
          throw new Error(msg);
        }
      } catch (err) {
        logger.error('IG sendText error', { error: String(err), correlationId: cid });
        throw err;
      }
    },

    async sendList(to, header, body, _button, sections) {
      const recipientId = to.replace(/^ig_/, '');
      const allRows = sections.flatMap(s => s.rows);

      await this.sendText(to, `*${header}*\n\n${body}`);

      const fitsQuickReplies =
        allRows.length <= META_LIMITS.INSTAGRAM.QUICK_REPLY_LIMIT &&
        allRows.every(r => r.title.length <= META_LIMITS.INSTAGRAM.QUICK_REPLY_TITLE);

      try {
        if (fitsQuickReplies) {
          const payload = {
            messaging_type: 'RESPONSE',
            recipient: { id: recipientId },
            message: {
              text: 'اختر / Choose:',
              quick_replies: allRows.map(r => ({
                content_type: 'text',
                title: igQuickReplyTitle(r.title, r.description || r.title),
                payload: r.id,
              })),
            },
          };
          const res = await callMetaApi(IG_URL(), IG_HEADERS(), payload, cid);
          if (!res.ok) {
            const errBody = await res.clone().text().catch(() => '');
            const metaErr = errBody ? parseMetaError(errBody) : undefined;
            logMetaFailure(res.status, metaErr ?? undefined, cid);
            throw new Error(metaErr?.message || errBody || `status ${res.status}`);
          }
        } else {
          throw new Error('Too many rows for Instagram quick replies');
        }
      } catch (err) {
        await registerFallbackRows(to, allRows);
        logger.warn('IG sendList failed, falling back to numbered text', {
          error: String(err), correlationId: cid, rowCount: allRows.length,
        });
        const lines = allRows.map((r, i) => `${i + 1}. ${r.title}`);
        await this.sendText(to, `${lines.join('\n')}\n\nأرسل رقم اختيارك / Send the number of your choice.`);
      }
    },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  logger.info('Instagram webhook GET (verification)', { mode, tokenMatch: token === process.env.INSTAGRAM_VERIFY_TOKEN });

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const webhookStart = Date.now();
  const webhookId = generateWebhookId();

  logger.info('[Webhook] Instagram POST entered', { webhookId });

  const rawBody = await req.text().catch(() => '');
  logger.debug('[Webhook] Instagram raw body', { webhookId, rawBodySize: rawBody.length, rawBodyPreview: rawBody.slice(0, 500) });
   logger.info('IG Headers', {
    webhookId,
    signature256: req.headers.get('x-hub-signature-256'),
    signature1: req.headers.get('x-hub-signature'),
  });
  let body: any = null;
  try { body = JSON.parse(rawBody); } catch {
    logger.warn('[Webhook] Instagram — invalid JSON body, returning EVENT_RECEIVED', { webhookId, rawBodySize: rawBody.length });
  }

  if (!verifySignature(rawBody, req.headers.get('X-Hub-Signature-256'))) {
    logger.warn('[Webhook] Instagram — invalid signature, rejecting', { webhookId });
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const entry     = body?.entry?.[0];
    let messaging = entry?.messaging ?? [];

    // Instagram Graph API format: entry[0].changes[0].value { sender, message, ... }
    if (!messaging.length && entry?.changes?.length) {
      messaging = entry.changes
        .filter((c: { field?: string; value?: { sender?: { id?: string } } }) => c.value?.sender?.id)
        .map((c: { value?: unknown }) => c.value);
      if (messaging.length) {
        logger.info('[Webhook] Graph API format detected', {
          webhookId, changeCount: entry.changes.length, messageCount: messaging.length,
        });
      }
    }

    if (!messaging.length) {
      logger.info('[Webhook] Instagram — no messaging events, returning EVENT_RECEIVED', { webhookId, duration: Date.now() - webhookStart });
      return new Response('EVENT_RECEIVED', { status: 200 });
    }

    const adapter = makeInstagramAdapter(webhookId);
    metrics.instagramWebhooksTotal.inc();
    metrics.instagramWebhookLatency.observe(Date.now() - webhookStart);
    logger.info('Instagram webhook POST', {
      eventCount: messaging.length, webhookId, duration: Date.now() - webhookStart,
    });

    for (const event of messaging) {
      const msgStart = Date.now();

      if (event.message?.is_echo) {
        logger.debug('[Webhook] Instagram — echo message, skipped', { webhookId, senderId: event.sender?.id });
        continue;
      }

      const senderId = event.sender?.id as string | undefined;
      if (!senderId) {
        logger.debug('[Webhook] Instagram — no sender ID, skipped', { webhookId });
        continue;
      }

      const sessionId = `ig_${senderId}`;
      const messageId = event.message?.mid as string | undefined;

      const quickReplyPayload = event.message?.quick_reply?.payload as string | undefined;
      const postbackPayload   = event.postback?.payload as string | undefined;
      const typedText         = (event.message?.text ?? '').trim();

      const userInput = quickReplyPayload || postbackPayload || typedText;
      if (!userInput) {
        logger.debug('[Webhook] Instagram — empty user input, skipped', { webhookId, senderId, hasQuickReply: !!quickReplyPayload, hasPostback: !!postbackPayload });
        continue;
      }

      const correlationId = getOrCreateCorrelationId(webhookId);
      const isTextMessage = !quickReplyPayload && !postbackPayload;

      if (messageId) {
        const dup = await isDuplicateMessage(messageId, 'instagram', sessionId, correlationId);
        if (dup) {
          metrics.instagramDuplicates.inc();
          logger.info('[Webhook] Duplicate skipped', { messageId, senderId, webhookId, correlationId });
          trackEvent({
            conversationId: `conv_${sessionId}`,
            userId: sessionId,
            platform: 'instagram',
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

      logger.debug('Processing Instagram message', {
        senderId, userInput, hasQuickReply: !!quickReplyPayload,
        isText: isTextMessage, messageId, correlationId, webhookId,
      });

      try {
        await processMessage(
          sessionId, userInput, adapter,
          BookingSource.instagram, isTextMessage,
          correlationId, messageId, webhookId,
        );
      } catch (err) {
        logger.error('processMessage error', {
          error: String(err), senderId, userInput, correlationId, webhookId,
        });
      }

      metrics.instagramMessagesProcessed.inc();
      logger.trace('[Webhook] message processed', {
        senderId, userInput, duration: Date.now() - msgStart, correlationId,
      });
    }
  } catch (err) {
    logger.error('Instagram webhook error', {
      error: String(err), webhookId, duration: Date.now() - webhookStart,
    });
  }

  logger.info('[Webhook] Instagram POST completed', { webhookId, duration: Date.now() - webhookStart });
  return new Response('EVENT_RECEIVED', { status: 200 });
}
