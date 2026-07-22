import { prisma } from './prisma';
import { logger } from './logger';

const REPLAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface VerifiedWebhook {
  doctorId: string;
  channelId: string;
  resourceId: string;
  resourceState: string;
  messageNumber: number;
}

interface WebhookHeaders {
  channelId: string | null;
  resourceId: string | null;
  resourceState: string | null;
  channelToken: string | null;
  messageNumber: string | null;
  expiration: string | null;
  channelExpiration: string | null;
}

export function extractWebhookHeaders(headers: Record<string, string | string[] | null | undefined>): WebhookHeaders {
  const get = (name: string): string | null => {
    const val = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.replace(/-/g, '_')];
    if (!val) return null;
    if (Array.isArray(val)) return val[0] ?? null;
    return val;
  };

  const headerMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    headerMap[key.toLowerCase()] = Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  }

  return {
    channelId: get('x-goog-channel-id'),
    resourceId: get('x-goog-resource-id'),
    resourceState: get('x-goog-resource-state'),
    channelToken: get('x-goog-channel-token'),
    messageNumber: get('x-goog-message-number'),
    expiration: get('x-goog-channel-expiration'),
    channelExpiration: null,
  };
}

export function validateRequiredHeaders(headers: WebhookHeaders): string | null {
  if (!headers.channelId) return 'Missing x-goog-channel-id';
  if (!headers.resourceId) return 'Missing x-goog-resource-id';
  if (!headers.resourceState) return 'Missing x-goog-resource-state';
  return null;
}

export async function verifyChannelExists(channelId: string, resourceId: string): Promise<{
  valid: boolean;
  channel?: { doctorId: string; status: string; expiration: Date };
  error?: string;
}> {
  const channel = await prisma.calendarChannel.findUnique({ where: { channelId } });

  if (!channel) {
    return { valid: false, error: 'Channel not found' };
  }

  if (channel.resourceId !== resourceId) {
    return { valid: false, error: 'Resource ID mismatch' };
  }

  if (channel.status !== 'active' && channel.status !== 'expiring') {
    return { valid: false, error: `Channel status is ${channel.status}` };
  }

  return { valid: true, channel };
}

export function verifyChannelToken(token: string | null, expectedDoctorId: string): string | null {
  if (token && token !== expectedDoctorId) {
    return 'Channel token does not match doctor';
  }
  return null;
}

export function verifyExpiration(channelExpiration: Date): string | null {
  if (channelExpiration <= new Date()) {
    return 'Channel has expired';
  }
  return null;
}

export function isDuplicateNotification(messageNumber: number): boolean {
  if (messageNumber <= 1) return false;
  return true;
}

export function verifyMessageNumber(messageNumber: string | null): { valid: boolean; number: number } {
  const num = messageNumber ? parseInt(messageNumber, 10) : 0;
  if (isNaN(num) || num < 0) {
    return { valid: false, number: 0 };
  }
  return { valid: true, number: num };
}

export function verifyResourceState(state: string | null): string | null {
  if (!state) return null;
  const valid = ['sync', 'exists'];
  if (!valid.includes(state)) {
    return `Unknown resource state: ${state}`;
  }
  return null;
}

const processedCache = new Map<string, number>();

function getReplayKey(channelId: string, resourceId: string, messageNumber: number): string {
  return `${channelId}:${resourceId}:${messageNumber}`;
}

export function checkReplayAttack(channelId: string, resourceId: string, messageNumber: number): boolean {
  const key = getReplayKey(channelId, resourceId, messageNumber);
  const processed = processedCache.get(key);
  if (processed && Date.now() - processed < REPLAY_CACHE_TTL_MS) {
    logger.warn('Replay attack detected', { channelId, resourceId, messageNumber });
    return true;
  }
  return false;
}

export function markNotificationProcessed(channelId: string, resourceId: string, messageNumber: number): void {
  const key = getReplayKey(channelId, resourceId, messageNumber);
  processedCache.set(key, Date.now());

  if (processedCache.size > 10000) {
    const cutoff = Date.now() - REPLAY_CACHE_TTL_MS;
    for (const [k, ts] of processedCache) {
      if (ts < cutoff) processedCache.delete(k);
    }
  }
}

export function getProcessedCacheSize(): number {
  return processedCache.size;
}

export async function verifyWebhook(headers: Record<string, string | string[] | null | undefined>): Promise<{
  valid: boolean;
  doctorId?: string;
  resourceState?: string;
  messageNumber?: number;
  shouldProcess: boolean;
  error?: string;
  statusCode: number;
}> {
  const extracted = extractWebhookHeaders(headers);

  const missing = validateRequiredHeaders(extracted);
  if (missing) {
    logger.warn('Webhook validation: missing headers', { missing });
    return { valid: false, error: missing, shouldProcess: false, statusCode: 400 };
  }

  const mn = verifyMessageNumber(extracted.messageNumber);
  if (!mn.valid) {
    return { valid: false, error: 'Invalid message number', shouldProcess: false, statusCode: 400 };
  }

  const stateErr = verifyResourceState(extracted.resourceState);
  if (stateErr) {
    logger.warn('Webhook validation: invalid state', { state: extracted.resourceState });
    return { valid: false, error: stateErr, shouldProcess: false, statusCode: 200 };
  }

  const channelVerification = await verifyChannelExists(extracted.channelId!, extracted.resourceId!);
  if (!channelVerification.valid) {
    return {
      valid: false,
      error: channelVerification.error,
      shouldProcess: false,
      statusCode: channelVerification.error === 'Channel not found' ? 404 : 200,
    };
  }

  const channel = channelVerification.channel!;

  const tokenErr = verifyChannelToken(extracted.channelToken, channel.doctorId);
  if (tokenErr) {
    return { valid: false, error: tokenErr, shouldProcess: false, statusCode: 403 };
  }

  const expErr = verifyExpiration(channel.expiration);
  if (expErr) {
    return { valid: false, error: expErr, shouldProcess: false, statusCode: 200 };
  }

  if (extracted.resourceState === 'sync') {
    logger.debug('Webhook: sync notification received', {
      channelId: extracted.channelId,
      resourceId: extracted.resourceId,
    });
    return {
      valid: true,
      doctorId: channel.doctorId,
      resourceState: extracted.resourceState,
      messageNumber: mn.number,
      shouldProcess: false,
      statusCode: 200,
    };
  }

  if (checkReplayAttack(extracted.channelId!, extracted.resourceId!, mn.number)) {
    return {
      valid: false,
      error: 'Duplicate notification (replay detected)',
      shouldProcess: false,
      statusCode: 200,
    };
  }

  markNotificationProcessed(extracted.channelId!, extracted.resourceId!, mn.number);

  return {
    valid: true,
    doctorId: channel.doctorId,
    resourceState: extracted.resourceState,
    messageNumber: mn.number,
    shouldProcess: true,
    statusCode: 200,
  };
}
