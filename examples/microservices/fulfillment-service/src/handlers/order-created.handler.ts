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
    public readonly items: Array<{
      productId: string;
      quantity: number;
      price: number;
    }>,
  ) {
    super();
  }
}

/**
 * Listens for OrderCreatedEvent via nestjs-boot's EventBus
 * and enqueues a fulfillment job for async processing:
 * - Auto-create shipment
 * - Reserve inventory
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

    // Enqueue fulfillment job for async processing
    await this.queueService.addJob('fulfillment', 'process-new-order', {
      orderId: event.orderId,
      userId: event.userId,
      items: event.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        status: 'pending',
      })),
    });

    this.logger.log(
      `Fulfillment job enqueued for order ${event.orderId}`,
    );
  }
}
