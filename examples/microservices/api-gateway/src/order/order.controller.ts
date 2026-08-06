import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { OrderGateway } from './order.gateway';

class OrderItemDto {
  productId!: string;
  quantity!: number;
  price!: number;
}

class CreateOrderDto {
  userId!: string;
  items!: OrderItemDto[];
}

@Controller('orders')
export class OrderController {
  constructor(private readonly orderGateway: OrderGateway) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orderGateway.findOne(id);
  }

  @Get()
  findByUser(@Query('userId') userId: string) {
    return this.orderGateway.findByUser(userId);
  }

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orderGateway.create(dto.userId, dto.items);
  }
}
