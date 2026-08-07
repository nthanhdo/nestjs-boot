# 03 - Database (MongoDB + Mongoose)

MongoDB stores data as JSON-like documents (not rows/columns like SQL). Mongoose is an ODM (Object Document Mapper) that adds schemas, validation, and TypeScript types on top.

## How nestjs-boot Connects to MongoDB

In `main.ts`:

```typescript
database: {
  connections: {
    master: {
      writerUri: 'mongodb://localhost:27017/learning',
    },
  },
},
```

This one config block does all of this automatically:
1. Creates a Mongoose connection to MongoDB
2. Handles reconnection on failures
3. Makes the connection injectable throughout your app
4. Sets up health checks for the `/health` endpoint

## Schemas Define Your Data Shape

Open `src/product/product.schema.ts`:

```typescript
export const ProductSchema = new Schema({
  name:  { type: String, required: true, trim: true, index: true },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
}, { timestamps: true });
```

Each field has:
- **type**: String, Number, Boolean, Date, Array, etc.
- **required**: MongoDB rejects documents missing this field
- **min/max**: Numeric range validation
- **default**: Used when field is not provided
- **index**: Creates a database index for fast queries

`{ timestamps: true }` auto-adds `createdAt` and `updatedAt` fields.

## Registering Schemas

In `app.module.ts`:

```typescript
DatabaseModule.forFeature('master', [
  { name: Product.name, schema: ProductSchema },
]);
```

The string `'master'` must match a key in your `database.connections` config. After registration, any service in this module can inject the model:

```typescript
constructor(@InjectModel('Product') private productModel: Model<ProductDocument>) {}
```

## Common Mongoose Operations

```typescript
// Create
const product = new this.productModel({ name: 'Mouse', price: 29.99 });
await product.save();

// Read
await this.productModel.find().exec();                    // all
await this.productModel.findById(id).exec();              // by ID
await this.productModel.find({ category: 'electronics' }).exec(); // filtered

// Update
await this.productModel.findByIdAndUpdate(id, { price: 24.99 }, { new: true }).exec();

// Delete
await this.productModel.findByIdAndDelete(id).exec();
```

## Try It Yourself

```bash
# Create a product
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Keyboard","price":49.99,"stock":50}'

# Notice the auto-generated _id and timestamps in the response

# Try creating without required fields (should fail):
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"price":10}'
```

## Exercise

Ready to practice? Try [Exercise 01: Add a Field](../exercises/01-add-a-field.md)

---

Next: [04 - CRUD Operations](04-crud-operations.md)
