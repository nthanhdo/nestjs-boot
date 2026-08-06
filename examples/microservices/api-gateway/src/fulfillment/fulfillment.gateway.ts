import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
}

interface ShipmentItem {
  productId: string;
  quantity: number;
  status: string;
}

interface Shipment {
  id: string;
  orderId: string;
  userId: string;
  status: string;
  carrier: string;
  trackingNumber: string;
  shippingAddress: Address;
  items: ShipmentItem[];
  estimatedDelivery: string;
  shippedAt: string;
  deliveredAt: string;
  createdAt: string;
}

interface ShipmentList {
  items: Shipment[];
  total: number;
}

interface ReservationResponse {
  success: boolean;
  message: string;
}

interface FulfillmentServiceGrpc {
  createShipment(data: {
    orderId: string;
    userId: string;
    shippingAddress: Address;
    items: ShipmentItem[];
    carrier: string;
  }): Observable<Shipment>;
  getShipment(data: { id: string }): Observable<Shipment>;
  getShipmentByOrder(data: { orderId: string }): Observable<Shipment>;
  updateStatus(data: {
    id: string;
    status: string;
    trackingNumber: string;
  }): Observable<Shipment>;
  listShipments(data: {
    userId: string;
    status: string;
    page: number;
    limit: number;
  }): Observable<ShipmentList>;
  reserveInventory(data: {
    items: ShipmentItem[];
    orderId: string;
  }): Observable<ReservationResponse>;
  releaseInventory(data: {
    orderId: string;
  }): Observable<ReservationResponse>;
}

@Injectable()
export class FulfillmentGateway implements OnModuleInit {
  private fulfillmentService!: FulfillmentServiceGrpc;

  constructor(
    @Inject('FULFILLMENT_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.fulfillmentService =
      this.client.getService<FulfillmentServiceGrpc>('FulfillmentService');
  }

  createShipment(
    orderId: string,
    userId: string,
    shippingAddress: Address,
    items: ShipmentItem[],
    carrier: string,
  ): Observable<Shipment> {
    return this.fulfillmentService.createShipment({
      orderId,
      userId,
      shippingAddress,
      items,
      carrier,
    });
  }

  getShipment(id: string): Observable<Shipment> {
    return this.fulfillmentService.getShipment({ id });
  }

  getShipmentByOrder(orderId: string): Observable<Shipment> {
    return this.fulfillmentService.getShipmentByOrder({ orderId });
  }

  updateStatus(
    id: string,
    status: string,
    trackingNumber: string,
  ): Observable<Shipment> {
    return this.fulfillmentService.updateStatus({ id, status, trackingNumber });
  }

  listShipments(
    userId: string,
    status: string,
    page: number,
    limit: number,
  ): Observable<ShipmentList> {
    return this.fulfillmentService.listShipments({ userId, status, page, limit });
  }

  reserveInventory(
    items: ShipmentItem[],
    orderId: string,
  ): Observable<ReservationResponse> {
    return this.fulfillmentService.reserveInventory({ items, orderId });
  }

  releaseInventory(orderId: string): Observable<ReservationResponse> {
    return this.fulfillmentService.releaseInventory({ orderId });
  }
}
