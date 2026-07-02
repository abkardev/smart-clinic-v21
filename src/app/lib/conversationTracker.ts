import { prisma } from './prisma';
import { logger } from './logger';

export interface TrackEventInput {
  conversationId: string;
  userId: string;
  platform: string;
  currentState?: string;
  previousState?: string;
  eventType: string;
  payloadId?: string;
  isText: boolean;
  executionTimeMs?: number;
  success: boolean;
  errorMessage?: string;
  bookingCreated?: boolean;
  bookingId?: string;
  bookingCancelled?: boolean;
  sessionExpired?: boolean;
  correlationId?: string;
  messageId?: string;
  webhookId?: string;
}

let queue: TrackEventInput[] = [];
let flushing = false;

export async function trackEvent(input: TrackEventInput): Promise<void> {
  queue.push(input);

  if (!flushing) {
    flushing = true;
    setTimeout(flushQueue, 200);
  }
}

async function flushQueue(): Promise<void> {
  const batch = queue.splice(0);
  flushing = false;

  if (batch.length === 0) return;

  try {
    await prisma.conversationEvent.createMany({
      data: batch.map(e => ({
        conversationId: e.conversationId,
        userId: e.userId,
        platform: e.platform,
        currentState: e.currentState ?? '',
        previousState: e.previousState,
        eventType: e.eventType,
        payloadId: e.payloadId,
        isText: e.isText,
        executionTimeMs: e.executionTimeMs ?? 0,
        success: e.success,
        errorMessage: e.errorMessage,
        bookingCreated: e.bookingCreated ?? false,
        bookingId: e.bookingId,
        bookingCancelled: e.bookingCancelled ?? false,
        sessionExpired: e.sessionExpired ?? false,
        correlationId: e.correlationId,
        messageId: e.messageId,
        webhookId: e.webhookId,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    logger.error('[Tracker] Failed to flush events', { error: String(err), batchSize: batch.length });
    // Re-queue on failure
    queue.unshift(...batch);
  }
}
