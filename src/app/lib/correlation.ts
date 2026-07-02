import { randomUUID } from 'crypto';

const STORE = new Map<string, {cid: string; reqId: string}>();

export function generateCorrelationId(): string {
  return `cid_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export function generateWebhookId(): string {
  return `wh_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export function getOrCreateCorrelationId(webhookId: string): string {
  const existing = STORE.get(webhookId);
  if (existing) return existing.cid;
  const cid = generateCorrelationId();
  STORE.set(webhookId, { cid, reqId: webhookId });
  if (STORE.size > 10000) {
    const first = STORE.keys().next().value;
    if (first) STORE.delete(first);
  }
  return cid;
}
