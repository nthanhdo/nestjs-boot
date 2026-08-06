import { Schema, Document } from 'mongoose';

export interface ProductDocument extends Document {
  name: string;
  price: number;
  category: string;
  stock: number;
  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, index: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

ProductSchema.index({ category: 1, price: 1 });
ProductSchema.index({ name: 'text' });

export const Product = { name: 'Product' };
