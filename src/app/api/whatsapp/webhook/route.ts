export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { processMessage, BotAdapter } from '@/app/lib/botEngine';
import { BookingSource } from '@prisma/client';
import { logger } from '@/app/lib/logger';

const WA_URL = () => `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const WA_HEADERS = () => ({
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json',
});

// ─── Webhook signature verification ───────────────────────────────────────────
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    logger.warn('WHATSAPP_APP_SECRET not set — skipping signature verification');
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

// ─── WhatsApp adapter ─────────────────────────────────────────────────────────
function makeWhatsAppAdapter(): BotAdapter {
  return {
    async sendText(to, text) {
      try {
        const res = await fetchWithRetry(WA_URL(), {
          method: 'POST',
          headers: WA_HEADERS(),
          body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
        });
        if (!res.ok) logger.error('WA sendText failed', { status: res.status, body: await res.text() });
      } catch (err) {
        logger.error('WA sendText error', { error: String(err) });
      }
    },

    async sendList(to, header, body, button, sections) {
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
        });
        if (!res.ok) throw new Error(await res.text());
      } catch (err) {
        logger.warn('WA sendList failed, falling back to plain text', { error: String(err) });
        const items = sections.flatMap(s => s.rows).map((r, i) => `${i + 1}. ${r.title}`).join('\n');
        await this.sendText(to, `${body}\n\n${items}\n\nأرسل رقم اختيارك / Send the number of your choice.`);
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

  logger.info('WhatsApp webhook GET (verification)', { mode, tokenMatch: token === process.env.WHATSAPP_VERIFY_TOKEN });

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// ─── POST — incoming message ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text().catch(() => '');
  let body: any = null;
  try { body = JSON.parse(rawBody); } catch { /* invalid JSON */ }

  if (!verifySignature(rawBody, req.headers.get('X-Hub-Signature-256'))) {
    logger.warn('WhatsApp webhook — invalid signature');
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
    const adapter = makeWhatsAppAdapter();

    logger.info('WhatsApp webhook POST', { messageCount: messages.length });

    for (const message of messages) {
      const phone = message.from as string;
      const userInput: string =
        message.type === 'text' ? (message.text?.body ?? '').trim() :
        message.type === 'interactive'
          ? (message.interactive?.list_reply?.id ?? message.interactive?.button_reply?.id ?? '')
          : '';

      if (!userInput) continue;
      logger.debug('Processing WhatsApp message', { phone, type: message.type, userInput });
      await processMessage(phone, userInput, adapter, BookingSource.whatsapp);
    }
  } catch (err) {
    logger.error('WhatsApp webhook error', { error: String(err) });
  }

  return new Response('OK', { status: 200 });
}
