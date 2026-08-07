import { Schema, Document } from 'mongoose';

export interface ProductDocument extends Document {
  name: string;
  price: number;
  stock: number;
  category: string;       // <-- ADDED
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    category: {             // <-- ADDED
      type: String,
      required: true,
      trim: true,
      index: true,          // index for fast filtering by category
    },
    description: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

ProductSchema.index({ category: 1, price: 1 });
ProductSchema.index({ name: 'text' });

export const Product = { name: 'Product' };
