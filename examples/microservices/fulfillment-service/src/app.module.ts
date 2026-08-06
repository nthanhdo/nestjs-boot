import { Module } from '@nestjs/common';
import { DatabaseModule } from 'nestjs-boot';
import { FulfillmentController } from './fulfillment.controller';
import { FulfillmentService } from './fulfillment.service';
import { OrderCreatedHandler } from './handlers/order-created.handler';
import { Shipment, ShipmentSchema } from './schemas/shipment.schema';
import { Inventory, InventorySchema } from './schemas/inventory.schema';

@Module({
  imports: [
    DatabaseModule.forFeature('master', [
      { name: Shipment.name, schema: ShipmentSchema },
      { name: Inventory.name, schema: InventorySchema },
    ]),
  ],
  controllers: [FulfillmentController],
  providers: [FulfillmentService, OrderCreatedHandler],
})
export class AppModule {}
