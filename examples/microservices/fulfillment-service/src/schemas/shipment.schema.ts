import { Schema, Document } from 'mongoose';

export interface ShipmentItemData {
  productId: string;
  quantity: number;
  status: string;
}

export interface AddressData {
  street: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
}

export interface ShipmentDocument extends Document {
  orderId: string;
  userId: string;
  status: 'pending' | 'processing' | 'shipped' | 'in_transit' | 'delivered' | 'cancelled';
  carrier: string;
  trackingNumber: string;
  shippingAddress: AddressData;
  items: ShipmentItemData[];
  estimatedDelivery: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema(
  {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, default: '' },
    country: { type: String, required: true },
    zipCode: { type: String, required: true },
  },
  { _id: false },
);

const ShipmentItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    status: { type: String, default: 'pending' },
  },
  { _id: false },
);

export const ShipmentSchema = new Schema(
  {
    orderId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'in_transit', 'delivered', 'cancelled'],
      default: 'pending',
    },
    carrier: { type: String, default: '' },
    trackingNumber: { type: String, default: '' },
    shippingAddress: { type: AddressSchema, required: true },
    items: { type: [ShipmentItemSchema], required: true },
    estimatedDelivery: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ShipmentSchema.index({ userId: 1, status: 1 });
ShipmentSchema.index({ status: 1, createdAt: -1 });

export const Shipment = { name: 'Shipment' };
