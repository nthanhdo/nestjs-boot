import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Request,
  Logger,
} from '@nestjs/common';
import { Roles } from 'nestjs-boot';
import { OrderService } from './order.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './order.dto';

@Controller('orders')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(private readonly orderService: OrderService) {}

  // POST /orders -- create order (auth required, userId from JWT)
  @Post()
  async create(@Request() req: any, @Body() dto: CreateOrderDto) {
    const userId = req.user.sub;
    return this.orderService.create(userId, dto);
  }

  // GET /orders -- list my orders (auth required)
  @Get()
  async findAll(@Request() req: any) {
    const userId = req.user.sub;
    return this.orderService.findAll(userId);
  }

  // GET /orders/:id -- get one order
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  // PATCH /orders/:id/status -- update status (admin only)
  @Roles('admin')
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateStatus(id, dto.status);
  }
}
