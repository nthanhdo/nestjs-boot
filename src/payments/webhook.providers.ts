import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookEvent, WebhookProvider } from './webhook.interfaces';

/**
 * Stripe webhook provider.
 *
 * Signature format: `t=<timestamp>,v1=<hmac-sha256>`
 * Verifies by recomputing HMAC over `${timestamp}.${rawBody}`.
 */
export class StripeWebhookProvider implements WebhookProvider {
  name = 'stripe';

  verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    try {
      const parts = Object.fromEntries(
        signature.split(',').map((part) => {
          const [key, ...rest] = part.split('=');
          return [key, rest.join('=')];
        }),
      );

      const timestamp = parts['t'];
      const v1 = parts['v1'];
      if (!timestamp || !v1) return false;

      const signedPayload = `${timestamp}.${payload.toString('utf8')}`;
      const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');

      return timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  normalizeEvent(rawPayload: unknown): WebhookEvent {
    const raw = rawPayload as Record<string, unknown>;
    return {
      provider: 'stripe',
      type: (raw['type'] as string) ?? 'unknown',
      id: (raw['id'] as string) ?? `stripe_${Date.now()}`,
      data: (raw['data'] as Record<string, unknown>) ?? {},
      timestamp: raw['created']
        ? new Date((raw['created'] as number) * 1000)
        : new Date(),
      raw,
    };
  }
}

/**
 * Configuration for PayPal webhook provider.
 */
export interface PayPalWebhookConfig {
  /**
   * Optional custom verification function. PayPal uses certificate-based RSA
   * verification (not HMAC), so production deployments should provide their own
   * verifyFn using `@paypal/paypal-server-sdk` or the PayPal REST API
   * `POST /v1/notifications/verify-webhook-signature`.
   *
   * When provided, this function is used instead of the built-in HMAC fallback.
   */
  verifyFn?: (payload: Buffer, signature: string, secret: string) => boolean;
}

/**
 * PayPal webhook provider.
 *
 * @deprecated The built-in HMAC-SHA256 verification is a simplified placeholder.
 * PayPal actually uses certificate-based RSA verification. Provide a custom
 * `verifyFn` via {@link PayPalWebhookConfig} for production use, e.g. using
 * `@paypal/paypal-server-sdk` or the PayPal webhook verification REST API.
 */
export class PayPalWebhookProvider implements WebhookProvider {
  name = 'paypal';
  private readonly verifyFn?: (payload: Buffer, signature: string, secret: string) => boolean;

  constructor(config?: PayPalWebhookConfig) {
    this.verifyFn = config?.verifyFn;
  }

  verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    if (this.verifyFn) {
      return this.verifyFn(payload, signature, secret);
    }

    console.warn(
      '[nestjs-boot] PayPalWebhookProvider: using simplified HMAC verification. ' +
      'PayPal uses certificate-based RSA verification in production. ' +
      'Provide a verifyFn for proper verification.',
    );

    try {
      const expected = createHmac('sha256', secret).update(payload).digest('base64');
      const sigBuf = Buffer.from(signature, 'base64');
      const expBuf = Buffer.from(expected, 'base64');
      if (sigBuf.length !== expBuf.length) return false;
      return timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  normalizeEvent(rawPayload: unknown): WebhookEvent {
    const raw = rawPayload as Record<string, unknown>;
    return {
      provider: 'paypal',
      type: (raw['event_type'] as string) ?? 'unknown',
      id: (raw['id'] as string) ?? `paypal_${Date.now()}`,
      data: (raw['resource'] as Record<string, unknown>) ?? {},
      timestamp: raw['create_time']
        ? new Date(raw['create_time'] as string)
        : new Date(),
      raw,
    };
  }
}
