// ============================================================
// LESSON 5: Mongoose Schema + Validation
// ============================================================
//
// A schema defines the SHAPE of your data in MongoDB.
// Unlike SQL databases (fixed columns), MongoDB is schema-less
// by default -- you can store anything. Mongoose adds structure
// on top, enforcing types and validation rules.
//
// WHY USE SCHEMAS:
//   Without: db.products.insert({ prce: -5, nmae: '' })  // silent garbage
//   With:    Mongoose rejects it -- price must be >= 0, name is required
//
// SCHEMA vs INTERFACE:
//   - Interface (ProductDocument): TypeScript compile-time types
//   - Schema (ProductSchema): Mongoose runtime validation + indexes
//   You need BOTH: interface for autocomplete, schema for enforcement.
//
// NESTJS-BOOT CONNECTION:
// In app.module.ts, we register schemas via:
//   DatabaseModule.forFeature('master', [{ name: 'Product', schema: ProductSchema }])
// This makes @InjectModel('Product') available in any service.
// ============================================================

import { Schema, Document } from 'mongoose';

// --------------------------------------------------------
// Document Interface
//
// This defines what a Product looks like in TypeScript.
// `extends Document` adds Mongoose document methods like
// .save(), .toObject(), .populate(), etc.
//
// IMPORTANT: This interface is for YOUR code (autocomplete + type safety).
// The Schema below is what MongoDB actually enforces at runtime.
// --------------------------------------------------------
export interface ProductDocument extends Document {
  name: string;
  price: number;
  stock: number;
  description?: string;  // optional field (no `required` in schema)
  createdAt: Date;        // auto-added by { timestamps: true }
  updatedAt: Date;        // auto-added by { timestamps: true }
}

// --------------------------------------------------------
// Mongoose Schema
//
// Each field definition has:
//   type:     JavaScript constructor (String, Number, Boolean, Date, etc.)
//   required: must be present when creating a document
//   index:    create a MongoDB index for fast queries on this field
//   min/max:  numeric range validation
//   trim:     remove leading/trailing whitespace
//   default:  value used when field is not provided
//
// PERFORMANCE TIP: Indexes speed up queries but slow down writes.
// Only index fields you actually query by.
// --------------------------------------------------------
export const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: true,   // cannot create a product without a name
      trim: true,       // "  Mouse  " becomes "Mouse"
      index: true,      // we'll query products by name
    },
    price: {
      type: Number,
      required: true,
      min: 0,           // no negative prices
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,       // if not provided, start at 0
    },
    description: {
      type: String,
      trim: true,
      // Not required -- optional field
    },
  },
  {
    // { timestamps: true } auto-adds createdAt and updatedAt fields.
    // MongoDB stores them as ISODate, Mongoose exposes them as JS Date.
    // You never need to set these manually -- Mongoose handles it.
    timestamps: true,
  },
);

// --------------------------------------------------------
// Compound Index
//
// This index speeds up queries that filter by BOTH name and price,
// like: "Find all products named 'Mouse' under $50"
//
// MongoDB can also use this index for queries on just `name`
// (the first field), but NOT for queries on just `price`.
// Order matters in compound indexes!
// --------------------------------------------------------
ProductSchema.index({ name: 1, price: 1 });

// --------------------------------------------------------
// Text Index
//
// Enables full-text search: db.products.find({ $text: { $search: 'wireless' } })
// Only ONE text index per collection is allowed in MongoDB.
// --------------------------------------------------------
ProductSchema.index({ name: 'text' });

// --------------------------------------------------------
// Export a constant for use with DatabaseModule.forFeature()
//
// { name: 'Product' } is used as the model name.
// @InjectModel('Product') in services refers to this name.
// --------------------------------------------------------
export const Product = { name: 'Product' };

// ============================================================
// WHAT'S HAPPENING UNDER THE HOOD:
//
// 1. Mongoose compiles the Schema into a Model
// 2. The Model is a constructor: new Model({...}) creates a Document
// 3. Documents have methods: .save(), .toObject(), .validate()
// 4. When you call .save(), Mongoose:
//    a. Runs validators (required, min, max, custom)
//    b. Applies defaults
//    c. Trims strings
//    d. Sends the insert/update to MongoDB
//    e. Returns the saved document with _id populated
//
// MongoDB stores documents as BSON (binary JSON). Each document
// gets a unique _id (ObjectId) automatically.
//
// Next lesson: Open src/product/product.dto.ts
// ============================================================
