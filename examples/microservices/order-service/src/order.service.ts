import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrderDocument, OrderItem } from './schemas/order.schema';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectModel('Order') private readonly orderModel: Model<OrderDocument>,
  ) {}

  async create(userId: string, items: OrderItem[]): Promise<OrderDocument> {
    const total = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const order = new this.orderModel({
      userId,
      items,
      total: Math.round(total * 100) / 100,
      status: 'pending',
    });

    const saved = await order.save();
    this.logger.log(`Order created: ${saved._id} for user ${userId}, total: $${saved.total}`);
    return saved;
  }

  async findOne(id: string): Promise<OrderDocument> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async findByUser(userId: string): Promise<{ items: OrderDocument[]; total: number }> {
    const [items, total] = await Promise.all([
      this.orderModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .exec(),
      this.orderModel.countDocuments({ userId }).exec(),
    ]);

    return { items, total };
  }
}
