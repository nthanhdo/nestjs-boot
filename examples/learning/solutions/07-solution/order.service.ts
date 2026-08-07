// Solution 07: Order service that validates products + decreases stock

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrderDocument } from '../06-solution/order.schema';
import { CreateOrderDto } from '../06-solution/order.dto';
import { ProductService } from '../../src/product/product.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectModel('Order')
    private readonly orderModel: Model<OrderDocument>,
    // ADDED: inject ProductService to validate products
    private readonly productService: ProductService,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<OrderDocument> {
    // Validate each item: product exists + has enough stock
    const validatedItems = [];

    for (const item of dto.items) {
      // findOne throws NotFoundException if product doesn't exist
      const product = await this.productService.findOne(item.productId);

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}": requested ${item.quantity}, available ${product.stock}`,
        );
      }

      // Use the REAL price from database (don't trust client)
      validatedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price: product.price,  // <-- real price, not client-provided
      });
    }

    // Decrease stock for each product
    for (const item of validatedItems) {
      const product = await this.productService.findOne(item.productId);
      await this.productService.update(item.productId, {
        stock: product.stock - item.quantity,
      });
    }

    // Calculate total from validated (real) prices
    const total = validatedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const order = new this.orderModel({
      userId,
      items: validatedItems,
      total,
      status: 'pending',
    });

    const saved = await order.save();
    this.logger.log(`Order ${saved._id}: $${total} (${validatedItems.length} items)`);
    return saved;
  }

  async findAll(userId: string): Promise<OrderDocument[]> {
    return this.orderModel.find({ userId }).sort({ createdAt: -1 }).exec();
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
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();
    if (!order) {
      throw new NotFoundException(`Order "${id}" not found`);
    }
    return order;
  }
}
