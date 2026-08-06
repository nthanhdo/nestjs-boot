import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Processor, Process, OnFailed, OnCompleted } from 'nestjs-boot';
import { NotificationDocument } from './schemas/notification.schema';

/**
 * NotificationService handles:
 * 1. gRPC queries (GetNotifications, MarkAsRead)
 * 2. Queue job processing (send-order-confirmation)
 *
 * Uses @Processor/@Process decorators from nestjs-boot's Queue module
 * to process notification jobs asynchronously.
 */
@Injectable()
@Processor('notifications')
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel('Notification')
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  /**
   * Process notification jobs from the queue.
   * Each job creates a persistent notification record.
   */
  @Process('send-order-confirmation')
  async processOrderConfirmation(job: {
    data: { userId: string; message: string; type: string };
  }) {
    const { userId, message, type } = job.data;

    const notification = await this.notificationModel.create({
      userId,
      message,
      type,
    });

    this.logger.log(
      `Notification created: ${notification._id} for user ${userId} [${type}]`,
    );

    // In production: send email, push notification, etc.
    return { notificationId: notification._id!.toString() };
  }

  @OnFailed()
  onFailed(job: { id?: string; name: string }, error: Error) {
    this.logger.error(
      `Notification job ${job.name} (${job.id}) failed: ${error.message}`,
    );
  }

  @OnCompleted()
  onCompleted(job: { id?: string; name: string }, result: unknown) {
    this.logger.log(`Notification job ${job.name} (${job.id}) completed`);
  }

  /**
   * gRPC: Get notifications for a user (paginated).
   */
  async getNotifications(userId: string, page = 1, limit = 20) {
    const skip = (Math.max(page, 1) - 1) * limit;

    const [items, total] = await Promise.all([
      this.notificationModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(limit, 100))
        .exec(),
      this.notificationModel.countDocuments({ userId }).exec(),
    ]);

    return {
      items: items.map((n) => ({
        id: n._id!.toString(),
        userId: n.userId,
        message: n.message,
        type: n.type,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
      total,
    };
  }

  /**
   * gRPC: Mark a notification as read.
   */
  async markAsRead(id: string) {
    const result = await this.notificationModel
      .findByIdAndUpdate(id, { read: true })
      .exec();
    return { success: !!result };
  }
}
