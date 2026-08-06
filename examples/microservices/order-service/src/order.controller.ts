import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { OrderService } from './order.service';

interface CreateOrderRequest {
  userId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
}

interface OrderById {
  id: string;
}

interface UserOrders {
  userId: string;
}

@Controller()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @GrpcMethod('OrderService', 'Create')
  async create(data: CreateOrderRequest) {
    const order = await this.orderService.create(data.userId, data.items);
    return {
      id: order._id?.toString(),
      userId: order.userId,
      items: order.items,
      total: order.total,
      status: order.status,
    };
  }

  @GrpcMethod('OrderService', 'FindOne')
  async findOne(data: OrderById) {
    const order = await this.orderService.findOne(data.id);
    return {
      id: order._id?.toString(),
      userId: order.userId,
      items: order.items,
      total: order.total,
      status: order.status,
    };
  }

  @GrpcMethod('OrderService', 'FindByUser')
  async findByUser(data: UserOrders) {
    const result = await this.orderService.findByUser(data.userId);
    return {
      items: result.items.map((order) => ({
        id: order._id?.toString(),
        userId: order.userId,
        items: order.items,
        total: order.total,
        status: order.status,
      })),
      total: result.total,
    };
  }
}
