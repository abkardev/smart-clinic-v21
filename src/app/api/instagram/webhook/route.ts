export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { processMessage, BotAdapter } from '@/app/lib/botEngine';
import { BookingSource } from '@prisma/client';
import { logger } from '@/app/lib/logger';

const IG_URL = () => `https://graph.facebook.com/v21.0/me/messages`;
const IG_HEADERS = () => ({
  Authorization: `Bearer ${process.env.INSTAGRAM_TOKEN}`,
  'Content-Type': 'application/json',
});

// ─── Webhook signature verification ───────────────────────────────────────────
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    logger.warn('INSTAGRAM_APP_SECRET not set — skipping signature verification');
    return true;
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

// ─── Retry helper for Meta API calls ──────────────────────────────────────────
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500;
        logger.warn(`Meta API transient error (${res.status}), retrying in ${delay}ms`, { attempt, status: res.status });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
    return res;
  }
  throw new Error('fetchWithRetry: all retries exhausted');
}

// ─── Instagram Messaging adapter ─────────────────────────────────────────────
const QUICK_REPLY_LIMIT = 13;
const QUICK_REPLY_TITLE_MAX = 20;

function makeInstagramAdapter(): BotAdapter {
  return {
    async sendText(to, text) {
      try {
        const res = await fetchWithRetry(IG_URL(), {
          method: 'POST',
          headers: IG_HEADERS(),
          body: JSON.stringify({
            recipient: { id: to },
            message: { text },
          }),
        });
        if (!res.ok) logger.error('IG sendText failed', { status: res.status });
      } catch (err) {
        logger.error('IG sendText error', { error: String(err) });
      }
    },

    async sendList(to, header, body, _button, sections) {
      const allRows = sections.flatMap(s => s.rows);

      await this.sendText(to, `*${header}*\n\n${body}`);

      const fitsQuickReplies =
        allRows.length <= QUICK_REPLY_LIMIT &&
        allRows.every(r => r.title.length <= QUICK_REPLY_TITLE_MAX);

      try {
        if (fitsQuickReplies) {
          const res = await fetchWithRetry(IG_URL(), {
            method: 'POST',
            headers: IG_HEADERS(),
            body: JSON.stringify({
              recipient: { id: to },
              message: {
                text: 'اختر / Choose:',
                quick_replies: allRows.map(r => ({
                  content_type: 'text',
                  title: r.title.length > QUICK_REPLY_TITLE_MAX
                    ? r.title.slice(0, QUICK_REPLY_TITLE_MAX - 1) + '…'
                    : r.title,
                  payload: r.id,
                })),
              },
            }),
          });
          if (!res.ok) throw new Error(await res.text());
        } else {
          const res = await fetchWithRetry(IG_URL(), {
            method: 'POST',
            headers: IG_HEADERS(),
            body: JSON.stringify({
              recipient: { id: to },
              message: {
                attachment: {
                  type: 'template',
                  payload: {
                    template_type: 'generic',
                    elements: allRows.slice(0, 10).map(r => ({
                      title: r.title.slice(0, 80),
                      subtitle: r.description?.slice(0, 80),
                      buttons: [{ type: 'postback', title: 'اختر / Select', payload: r.id }],
                    })),
                  },
                },
              },
            }),
          });
          if (!res.ok) throw new Error(await res.text());
        }
      } catch (err) {
        logger.warn('IG sendList error, falling back to plain text', { error: String(err) });
        const lines = allRows.map((r, i) => `${i + 1}. ${r.title}`);
        await this.sendText(to, `${lines.join('\n')}\n\nأرسل رقم اختيارك / Send the number of your choice.`);
      }
    },
  };
}

// ─── GET — webhook verification ───────────────────────────────────────────────
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

// ─── POST — incoming DM ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text().catch(() => '');
  let body: any = null;
  try { body = JSON.parse(rawBody); } catch { /* invalid JSON */ }

  if (!verifySignature(rawBody, req.headers.get('X-Hub-Signature-256'))) {
    logger.warn('Instagram webhook — invalid signature');
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const entry     = body?.entry?.[0];
    const messaging = entry?.messaging ?? [];
    if (!messaging.length) return new Response('EVENT_RECEIVED', { status: 200 });

    const adapter = makeInstagramAdapter();

    for (const event of messaging) {
      // Skip echo messages (bot's own replies) to prevent infinite loops
      if (event.message?.is_echo) {
        logger.debug('Skipping Instagram echo message');
        continue;
      }

      const senderId = event.sender?.id as string | undefined;
      if (!senderId) continue;

      const sessionId = `ig_${senderId}`;

      const quickReplyPayload = event.message?.quick_reply?.payload as string | undefined;
      const postbackPayload   = event.postback?.payload as string | undefined;
      const typedText         = (event.message?.text ?? '').trim();

      const userInput = quickReplyPayload || postbackPayload || typedText;
      if (!userInput) continue;

      logger.debug('Processing Instagram message', { senderId, userInput, hasQuickReply: !!quickReplyPayload });

      await processMessage(sessionId, userInput, adapter, BookingSource.instagram);
    }
  } catch (err) {
    logger.error('Instagram webhook error', { error: String(err) });
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
}
