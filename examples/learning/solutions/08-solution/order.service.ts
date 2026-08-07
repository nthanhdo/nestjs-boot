// Solution 08: Order service with event emission

import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventBusService } from 'nestjs-boot';
import { OrderDocument } from '../06-solution/order.schema';
import { CreateOrderDto } from '../06-solution/order.dto';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectModel('Order')
    private readonly orderModel: Model<OrderDocument>,
    // ADDED: event bus for emitting events
    private readonly eventBus: EventBusService,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<OrderDocument> {
    const total = dto.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const order = new this.orderModel({
      userId,
      items: dto.items,
      total,
      status: 'pending',
    });

    const saved = await order.save();
    this.logger.log(`Order created: ${saved._id}`);

    // ADDED: emit event after successful save
    await this.eventBus.emit('order.created', {
      orderId: saved._id!.toString(),
      userId: saved.userId,
      total: saved.total,
      itemCount: saved.items.length,
    });

    return saved;
  }

  async findAll(userId: string): Promise<OrderDocument[]> {
    return this.orderModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<OrderDocument> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException(`Order "${id}" not found`);
    return order;
  }

  async updateStatus(id: string, status: string): Promise<OrderDocument> {
    const order = await this.orderModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();
    if (!order) throw new NotFoundException(`Order "${id}" not found`);

    // Emit status change event too
    await this.eventBus.emit('order.status_changed', {
      orderId: id,
      oldStatus: 'unknown',
      newStatus: status,
    });

    return order;
  }
}
