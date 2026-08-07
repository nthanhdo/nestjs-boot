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
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookEvent, WebhookModuleOptions } from './webhook.interfaces';
import { StripeWebhookProvider, PayPalWebhookProvider } from './webhook.providers';
import { WEBHOOK_OPTIONS, IDEMPOTENCY_STORE } from './constants';

/**
 * WebhookController — receives Stripe and PayPal webhook POSTs.
 *
 * NestJS must be configured with rawBody:true so Buffer is available:
 * ```ts
 * const app = await NestFactory.create(AppModule, { rawBody: true });
 * ```
 */
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly stripe = new StripeWebhookProvider();
  private readonly paypal = new PayPalWebhookProvider();

  constructor(
    @Inject(WEBHOOK_OPTIONS) private readonly options: WebhookModuleOptions,
    @Inject(IDEMPOTENCY_STORE) private readonly store: Map<string, boolean>,
  ) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    const stripeOptions = this.options.providers.stripe;
    if (!stripeOptions) {
      throw new UnauthorizedException('Stripe webhook not configured');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Raw body not available — enable rawBody in NestFactory');
    }

    if (!signature) {
      throw new UnauthorizedException('Missing stripe-signature header');
    }

    const valid = this.stripe.verifySignature(rawBody, signature, stripeOptions.secret);
    if (!valid) {
      throw new UnauthorizedException('Invalid Stripe webhook signature');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid JSON payload');
    }

    const event = this.stripe.normalizeEvent(parsed);
    await this.dispatchIfNew(event);
    return { received: true };
  }

  @Post('paypal')
  @HttpCode(HttpStatus.OK)
  async handlePayPal(
    @Req() req: RawBodyRequest<Request>,
    @Headers('paypal-transmission-sig') signature: string,
  ): Promise<{ received: boolean }> {
    const paypalOptions = this.options.providers.paypal;
    if (!paypalOptions) {
      throw new UnauthorizedException('PayPal webhook not configured');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Raw body not available — enable rawBody in NestFactory');
    }

    if (!signature) {
      throw new UnauthorizedException('Missing paypal-transmission-sig header');
    }

    const valid = this.paypal.verifySignature(rawBody, signature, paypalOptions.secret);
    if (!valid) {
      throw new UnauthorizedException('Invalid PayPal webhook signature');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid JSON payload');
    }

    const event = this.paypal.normalizeEvent(parsed);
    await this.dispatchIfNew(event);
    return { received: true };
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
