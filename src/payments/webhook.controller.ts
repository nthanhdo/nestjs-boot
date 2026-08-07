import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Inject,
  Logger,
  RawBodyRequest,
  Param,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookEvent, WebhookModuleOptions, WebhookProvider } from './webhook.interfaces';
import { StripeWebhookProvider, PayPalWebhookProvider } from './webhook.providers';
import { WEBHOOK_OPTIONS, IDEMPOTENCY_STORE } from './constants';

/**
 * WebhookController — dynamically routes webhook POSTs to registered providers.
 *
 * Built-in providers (Stripe, PayPal) are registered automatically when configured.
 * Custom providers are registered via `customProviders` in WebhookModuleOptions.
 *
 * NestJS must be configured with rawBody:true so Buffer is available:
 * ```ts
 * const app = await NestFactory.create(AppModule, { rawBody: true });
 * ```
 */
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly providerMap = new Map<string, { provider: WebhookProvider; secret: string }>();

  constructor(
    @Inject(WEBHOOK_OPTIONS) private readonly options: WebhookModuleOptions,
    @Inject(IDEMPOTENCY_STORE) private readonly store: Map<string, boolean>,
  ) {
    // Register built-in providers from config
    if (options.providers.stripe) {
      this.providerMap.set('stripe', {
        provider: new StripeWebhookProvider(),
        secret: options.providers.stripe.secret,
      });
    }
    if (options.providers.paypal) {
      this.providerMap.set('paypal', {
        provider: new PayPalWebhookProvider(),
        secret: options.providers.paypal.secret,
      });
    }

    // Register custom providers
    if (options.customProviders) {
      for (const customProvider of options.customProviders) {
        // Custom providers get their secret from provider config if available
        const providerConfig = (options.providers as Record<string, { secret: string } | undefined>)[customProvider.name];
        if (providerConfig) {
          this.providerMap.set(customProvider.name, {
            provider: customProvider,
            secret: providerConfig.secret,
          });
        }
      }
    }

    this.logger.log(`Webhook providers registered: ${[...this.providerMap.keys()].join(', ')}`);
  }

  /**
   * Dynamic webhook endpoint — routes to provider by name.
   * POST /webhooks/:provider
   */
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('provider') providerName: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ): Promise<{ received: boolean }> {
    const entry = this.providerMap.get(providerName);
    if (!entry) {
      throw new UnauthorizedException(`Unknown webhook provider: ${providerName}`);
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Raw body not available — enable rawBody in NestFactory');
    }

    // Extract signature from headers — provider-specific header names
    const signature = this.extractSignature(providerName, headers);
    if (!signature) {
      throw new UnauthorizedException(`Missing signature header for ${providerName}`);
    }

    const valid = entry.provider.verifySignature(rawBody, signature, entry.secret);
    if (!valid) {
      throw new UnauthorizedException(`Invalid ${providerName} webhook signature`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid JSON payload');
    }

    const event = entry.provider.normalizeEvent(parsed);
    await this.dispatchIfNew(event);
    return { received: true };
  }

  /**
   * Extract signature header based on provider name.
   * Known providers have conventional header names; custom providers
   * fall back to `x-webhook-signature`.
   */
  private extractSignature(providerName: string, headers: Record<string, string>): string | undefined {
    const headerMap: Record<string, string> = {
      stripe: 'stripe-signature',
      paypal: 'paypal-transmission-sig',
    };
    const headerName = headerMap[providerName] ?? 'x-webhook-signature';
    return headers[headerName];
  }

  /**
   * Idempotency check — skip duplicate events by event.id.
   * Uses in-memory Map (or MongoDB if wired in future).
   */
  private async dispatchIfNew(event: WebhookEvent): Promise<void> {
    if (this.store.has(event.id)) {
      this.logger.debug(`Duplicate webhook event skipped: ${event.id}`);
      return;
    }

    this.store.set(event.id, true);

    try {
      await this.options.handler(event);
    } catch (err) {
      this.logger.error(`Webhook handler error for ${event.id}: ${(err as Error).message}`);
      // Remove from store so it can be retried
      this.store.delete(event.id);
      throw err;
    }
  }
}
