import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: string;
}

interface OrderList {
  items: Order[];
  total: number;
}

interface OrderServiceGrpc {
  create(data: { userId: string; items: OrderItem[] }): Observable<Order>;
  findOne(data: { id: string }): Observable<Order>;
  findByUser(data: { userId: string }): Observable<OrderList>;
}

@Injectable()
export class OrderGateway implements OnModuleInit {
  private orderService!: OrderServiceGrpc;

  constructor(
    @Inject('ORDER_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.orderService = this.client.getService<OrderServiceGrpc>('OrderService');
  }

  create(userId: string, items: OrderItem[]): Observable<Order> {
    return this.orderService.create({ userId, items });
  }

  findOne(id: string): Observable<Order> {
    return this.orderService.findOne({ id });
  }

  findByUser(userId: string): Observable<OrderList> {
    return this.orderService.findByUser({ userId });
  }
}
