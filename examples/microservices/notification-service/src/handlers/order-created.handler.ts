import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, BootEvent, QueueService } from 'nestjs-boot';

/**
 * OrderCreatedEvent — emitted by order-service when an order is placed.
 * Extends BootEvent for automatic timestamp + correlationId.
 */
export class OrderCreatedEvent extends BootEvent {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly total: number,
  ) {
    super();
  }
}

/**
 * Listens for OrderCreatedEvent via nestjs-boot's EventBus
 * and enqueues a notification job for async processing.
 */
@Injectable()
export class OrderCreatedHandler {
  private readonly logger = new Logger(OrderCreatedHandler.name);

  constructor(private readonly queueService: QueueService) {}

  @OnEvent(OrderCreatedEvent)
  async handle(event: OrderCreatedEvent) {
    this.logger.log(
      `OrderCreatedEvent received: order=${event.orderId} user=${event.userId} total=$${event.total}`,
    );

    // Enqueue notification job for async processing
    await this.queueService.addJob('notifications', 'send-order-confirmation', {
      userId: event.userId,
      message: `Your order #${event.orderId} for $${event.total.toFixed(2)} has been placed.`,
      type: 'order',
    });
  }
}
