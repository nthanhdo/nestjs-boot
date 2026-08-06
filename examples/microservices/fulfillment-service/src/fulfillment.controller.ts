import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { FulfillmentService } from './fulfillment.service';

interface CreateShipmentRequest {
  orderId: string;
  userId: string;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
  };
  items: Array<{ productId: string; quantity: number; status: string }>;
  carrier: string;
}

interface ShipmentById {
  id: string;
}

interface OrderById {
  orderId: string;
}

interface UpdateStatusRequest {
  id: string;
  status: string;
  trackingNumber: string;
}

interface ListShipmentsRequest {
  userId: string;
  status: string;
  page: number;
  limit: number;
}

interface ReserveInventoryRequest {
  items: Array<{ productId: string; quantity: number; status: string }>;
  orderId: string;
}

interface ReleaseInventoryRequest {
  orderId: string;
}

function toShipmentResponse(shipment: any) {
  return {
    id: shipment._id?.toString(),
    orderId: shipment.orderId,
    userId: shipment.userId,
    status: shipment.status,
    carrier: shipment.carrier || '',
    trackingNumber: shipment.trackingNumber || '',
    shippingAddress: shipment.shippingAddress,
    items: shipment.items,
    estimatedDelivery: shipment.estimatedDelivery?.toISOString() || '',
    shippedAt: shipment.shippedAt?.toISOString() || '',
    deliveredAt: shipment.deliveredAt?.toISOString() || '',
    createdAt: shipment.createdAt?.toISOString() || '',
  };
}

@Controller()
export class FulfillmentController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @GrpcMethod('FulfillmentService', 'CreateShipment')
  async createShipment(data: CreateShipmentRequest) {
    const shipment = await this.fulfillmentService.createShipment(
      data.orderId,
      data.userId,
      data.shippingAddress,
      data.items,
      data.carrier,
    );
    return toShipmentResponse(shipment);
  }

  @GrpcMethod('FulfillmentService', 'GetShipment')
  async getShipment(data: ShipmentById) {
    const shipment = await this.fulfillmentService.findOne(data.id);
    return toShipmentResponse(shipment);
  }

  @GrpcMethod('FulfillmentService', 'GetShipmentByOrder')
  async getShipmentByOrder(data: OrderById) {
    const shipment = await this.fulfillmentService.findByOrder(data.orderId);
    return toShipmentResponse(shipment);
  }

  @GrpcMethod('FulfillmentService', 'UpdateStatus')
  async updateStatus(data: UpdateStatusRequest) {
    const shipment = await this.fulfillmentService.updateStatus(
      data.id,
      data.status,
      data.trackingNumber,
    );
    return toShipmentResponse(shipment);
  }

  @GrpcMethod('FulfillmentService', 'ListShipments')
  async listShipments(data: ListShipmentsRequest) {
    const result = await this.fulfillmentService.listShipments(
      data.userId,
      data.status,
      data.page,
      data.limit,
    );
    return {
      items: result.items.map(toShipmentResponse),
      total: result.total,
    };
  }

  @GrpcMethod('FulfillmentService', 'ReserveInventory')
  async reserveInventory(data: ReserveInventoryRequest) {
    return this.fulfillmentService.reserveInventory(data.items, data.orderId);
  }

  @GrpcMethod('FulfillmentService', 'ReleaseInventory')
  async releaseInventory(data: ReleaseInventoryRequest) {
    return this.fulfillmentService.releaseInventory(data.orderId);
  }
}
