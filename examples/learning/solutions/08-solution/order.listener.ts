import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from 'nestjs-boot';

@Injectable()
export class OrderListener {
  private readonly logger = new Logger(OrderListener.name);

  @OnEvent('order.created')
  handleOrderCreated(payload: {
    orderId: string;
    userId: string;
    total: number;
    itemCount: number;
  }) {
    this.logger.log(
      `[EVENT] New order ${payload.orderId}: $${payload.total} ` +
      `(${payload.itemCount} items) by user ${payload.userId}`,
    );
    // In a real app, you might:
    //   - Send a confirmation email
    //   - Update analytics/dashboards
    //   - Notify the warehouse
    //   - Trigger a payment flow
  }

  @OnEvent('order.status_changed')
  handleStatusChanged(payload: {
    orderId: string;
    oldStatus: string;
    newStatus: string;
  }) {
    this.logger.log(
      `[EVENT] Order ${payload.orderId} status: ${payload.oldStatus} -> ${payload.newStatus}`,
    );
  }
}
