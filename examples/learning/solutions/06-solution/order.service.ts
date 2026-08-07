import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrderDocument } from './order.schema';
import { CreateOrderDto } from './order.dto';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectModel('Order')
    private readonly orderModel: Model<OrderDocument>,
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
    this.logger.log(`Order created: ${saved._id} by user ${userId}, total: $${total}`);
    return saved;
  }

  async findAll(userId: string): Promise<OrderDocument[]> {
    return this.orderModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<OrderDocument> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) {
      throw new NotFoundException(`Order "${id}" not found`);
    }
    return order;
  }

  async updateStatus(id: string, status: string): Promise<OrderDocument> {
    const order = await this.orderModel
      .findByIdAndUpdate(id, { status }, { new: true, runValidators: true })
      .exec();
    if (!order) {
      throw new NotFoundException(`Order "${id}" not found`);
    }
    this.logger.log(`Order ${id} status -> ${status}`);
    return order;
  }
}
