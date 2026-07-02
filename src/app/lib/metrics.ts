// ─── Lightweight in-memory metrics store ─────────────────────────────────────
// Values are aggregated per-process. On serverless (Vercel) each invocation
// is an isolated process, so these reflect per-instance data only. For
// cross-instance aggregation, pipe logs to a telemetry service instead.

const BUCKETS = [100, 200, 500, 1000, 2000, 5000, 10000] as const;
type Bucket = (typeof BUCKETS)[number];

class Histogram {
  private bins: Map<Bucket, number>;
  private count = 0;
  private sum = 0;
  private max = 0;

  constructor() {
    this.bins = new Map(BUCKETS.map((b) => [b, 0]));
  }

  observe(ms: number): void {
    this.count++;
    this.sum += ms;
    if (ms > this.max) this.max = ms;
    for (const b of BUCKETS) {
      if (ms <= b) {
        this.bins.set(b, (this.bins.get(b) ?? 0) + 1);
        break;
      }
    }
  }

  snapshot() {
    const distribution: Record<string, number> = {};
    for (const [b, c] of this.bins) distribution[`le_${b}`] = c;
    return {
      count: this.count,
      sum: this.sum,
      avg: this.count > 0 ? Math.round(this.sum / this.count) : 0,
      max: this.max,
      distribution,
    };
  }
}

class Counter {
  private value = 0;
  inc(n = 1): void { this.value += n; }
  snapshot(): number { return this.value; }
}

class Gauge {
  private value = 0;
  set(n: number): void { this.value = n; }
  inc(n = 1): void { this.value += n; }
  dec(n = 1): void { this.value -= n; }
  snapshot(): number { return this.value; }
}

const START_TIME = Date.now();

export const metrics = {
  // Webhook
  whatsappWebhooksTotal: new Counter(),
  whatsappWebhookLatency: new Histogram(),
  whatsappMessagesProcessed: new Counter(),
  whatsappDuplicates: new Counter(),

  instagramWebhooksTotal: new Counter(),
  instagramWebhookLatency: new Histogram(),
  instagramMessagesProcessed: new Counter(),
  instagramDuplicates: new Counter(),

  // Booking
  bookingsCreated: new Counter(),
  bookingsFailed: new Counter(),
  bookingsAbandoned: new Counter(),
  bookingCreationLatency: new Histogram(),

  // Conversation
  conversationsStarted: new Counter(),
  conversationsCompleted: new Counter(),
  sessionsExpired: new Counter(),
  sessionConflicts: new Counter(),

  // API
  apiCallsTotal: new Counter(),
  apiLatency: new Histogram(),

  // External API latencies
  googleCalendarLatency: new Histogram(),
  metaApiLatency: new Histogram(),

  // Retry
  retryAttempts: new Counter(),
  retriesExhausted: new Counter(),

  // Active state (gauges)
  activeWhatsAppSessions: new Gauge(),
  activeInstagramSessions: new Gauge(),

  snapshot(): Record<string, unknown> {
    const s: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(this)) {
      if (val instanceof Histogram || val instanceof Counter || val instanceof Gauge) {
        s[key] = val.snapshot();
      }
    }
    return s;
  },
};

export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - START_TIME) / 1000);
}
