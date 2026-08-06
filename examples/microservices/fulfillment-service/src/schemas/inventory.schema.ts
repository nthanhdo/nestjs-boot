import { Schema, Document } from 'mongoose';

export interface InventoryDocument extends Document {
  productId: string;
  available: number;
  reserved: number;
  createdAt: Date;
  updatedAt: Date;
}

export const InventorySchema = new Schema(
  {
    productId: { type: String, required: true, unique: true },
    available: { type: Number, required: true, default: 0, min: 0 },
    reserved: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const Inventory = { name: 'Inventory' };
