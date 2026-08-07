/**
 * Normalized webhook event — provider-agnostic.
 */
export interface WebhookEvent {
  /** Payment provider that sent this event */
  provider: 'stripe' | 'paypal' | 'custom';
  /** Event type string, e.g. 'payment_intent.succeeded', 'PAYMENT.CAPTURE.COMPLETED' */
  type: string;
  /** Provider-assigned unique event ID — used for idempotency deduplication */
  id: string;
  /** Parsed event data payload */
  data: Record<string, unknown>;
  /** Event timestamp */
  timestamp: Date;
  /** Original raw payload from the provider */
  raw: unknown;
}

/**
 * Pluggable webhook provider — implement this to add custom providers.
 */
export interface WebhookProvider {
  name: string;
  /** Return true if signature is valid; false → 401 */
  verifySignature(payload: Buffer, signature: string, secret: string): boolean;
  /** Map provider-specific payload to normalized WebhookEvent */
  normalizeEvent(rawPayload: unknown): WebhookEvent;
}

/**
 * Options for WebhookModule.register().
 */
export interface WebhookModuleOptions {
  providers: {
    stripe?: { secret: string; path?: string };
    paypal?: { secret: string; path?: string };
  };
  /** Called for every verified, deduplicated event */
  handler: (event: WebhookEvent) => Promise<void>;
  /** Optional custom providers */
  customProviders?: WebhookProvider[];
}
