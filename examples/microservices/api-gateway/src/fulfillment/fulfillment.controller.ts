import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { FulfillmentGateway } from './fulfillment.gateway';

class AddressDto {
  street!: string;
  city!: string;
  state!: string;
  country!: string;
  zipCode!: string;
}

class ShipmentItemDto {
  productId!: string;
  quantity!: number;
  status!: string;
}

class CreateShipmentDto {
  orderId!: string;
  userId!: string;
  shippingAddress!: AddressDto;
  items!: ShipmentItemDto[];
  carrier!: string;
}

class UpdateStatusDto {
  status!: string;
  trackingNumber!: string;
}

class ReserveInventoryDto {
  items!: ShipmentItemDto[];
  orderId!: string;
}

class ReleaseInventoryDto {
  orderId!: string;
}

@Controller('fulfillment')
export class FulfillmentController {
  constructor(private readonly fulfillmentGateway: FulfillmentGateway) {}

  @Post('shipments')
  createShipment(@Body() dto: CreateShipmentDto) {
    return this.fulfillmentGateway.createShipment(
      dto.orderId,
      dto.userId,
      dto.shippingAddress,
      dto.items,
      dto.carrier,
    );
  }

  @Get('shipments/:id')
  getShipment(@Param('id') id: string) {
    return this.fulfillmentGateway.getShipment(id);
  }

  @Get('shipments')
  listShipments(
    @Query('userId') userId: string,
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    return this.fulfillmentGateway.listShipments(
      userId || '',
      status || '',
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 20,
    );
  }

  @Get('orders/:orderId/shipment')
  getShipmentByOrder(@Param('orderId') orderId: string) {
    return this.fulfillmentGateway.getShipmentByOrder(orderId);
  }

  @Patch('shipments/:id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.fulfillmentGateway.updateStatus(
      id,
      dto.status,
      dto.trackingNumber || '',
    );
  }

  @Post('inventory/reserve')
  reserveInventory(@Body() dto: ReserveInventoryDto) {
    return this.fulfillmentGateway.reserveInventory(dto.items, dto.orderId);
  }

  @Post('inventory/release')
  releaseInventory(@Body() dto: ReleaseInventoryDto) {
    return this.fulfillmentGateway.releaseInventory(dto.orderId);
  }
}
