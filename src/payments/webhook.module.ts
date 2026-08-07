import { DynamicModule, Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookModuleOptions } from './webhook.interfaces';
import { WEBHOOK_OPTIONS, IDEMPOTENCY_STORE } from './constants';

/**
 * WebhookModule — payment webhook handling with idempotency.
 *
 * Registers POST /webhooks/stripe and POST /webhooks/paypal endpoints.
 * Verifies HMAC signatures before calling your handler.
 * Deduplicates events by event ID (in-memory; swap for MongoDB/Redis at scale).
 *
 * ```ts
 * WebhookModule.register({
 *   providers: {
 *     stripe: { secret: process.env.STRIPE_WEBHOOK_SECRET },
 *     paypal: { secret: process.env.PAYPAL_WEBHOOK_SECRET },
 *   },
 *   handler: async (event) => {
 *     if (event.type === 'payment_intent.succeeded') {
 *       await ordersService.fulfill(event.data);
 *     }
 *   },
 * })
 * ```
 *
 * ⚠️ NestJS must be configured with rawBody:true:
 * ```ts
 * const app = await NestFactory.create(AppModule, { rawBody: true });
 * ```
 */
@Module({})
export class WebhookModule {
  static register(options: WebhookModuleOptions): DynamicModule {
    return {
      module: WebhookModule,
      controllers: [WebhookController],
      providers: [
        {
          provide: WEBHOOK_OPTIONS,
          useValue: options,
        },
        {
          provide: IDEMPOTENCY_STORE,
          useValue: new Map<string, boolean>(),
        },
      ],
    };
  }
}
