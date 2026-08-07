// ============================================================
// LESSON 4: Business Logic + Dependency Injection
// ============================================================
//
// A Service contains your business logic -- the actual work of
// your application. Controllers are thin (just route requests);
// services are where the real code lives.
//
// WHY SEPARATE CONTROLLER AND SERVICE:
//   - Controller: "What HTTP verb + path triggers this?"
//   - Service: "What does this operation actually DO?"
//
// This separation means:
//   1. You can reuse the service from gRPC, CLI, tests, etc.
//   2. You can test business logic without HTTP
//   3. You can swap the controller (REST -> GraphQL) without
//      changing any business logic
//
// @Injectable() marks this class as something NestJS can inject.
// Without it, NestJS wouldn't know how to create instances.
// ============================================================

import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProductDocument } from './product.schema';
import { CreateProductDto, UpdateProductDto } from './product.dto';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  // --------------------------------------------------------
  // CONSTRUCTOR INJECTION
  //
  // @InjectModel('Product') tells NestJS: "give me the Mongoose
  // Model for the 'Product' schema." This works because we
  // registered it in app.module.ts with DatabaseModule.forFeature().
  //
  // The Model<ProductDocument> type gives us full TypeScript
  // autocomplete for Mongoose operations (find, create, save, etc.)
  // --------------------------------------------------------
  constructor(
    @InjectModel('Product')
    private readonly productModel: Model<ProductDocument>,
  ) {}

  // --------------------------------------------------------
  // CREATE -- Save a new product to MongoDB
  //
  // `new this.productModel(data)` creates a Mongoose document
  // (an in-memory object). `.save()` persists it to the database.
  //
  // We return the saved document, which includes the auto-generated
  // _id field and timestamps (createdAt, updatedAt).
  // --------------------------------------------------------
  async create(data: CreateProductDto): Promise<ProductDocument> {
    const product = new this.productModel(data);
    const saved = await product.save();
    this.logger.log(`Created product: ${saved._id} "${saved.name}"`);
    return saved;
  }

  // --------------------------------------------------------
  // READ ALL -- List products with pagination
  //
  // Pagination prevents loading thousands of records at once.
  // We use skip/limit (offset-based) for simplicity.
  // For production, consider cursor-based pagination (Exercise 02).
  //
  // Promise.all() runs count + find in parallel -- both are
  // independent database queries, so no reason to wait sequentially.
  // --------------------------------------------------------
  async findAll(
    page = 1,
    limit = 20,
  ): Promise<{ items: ProductDocument[]; total: number; page: number; limit: number }> {
    const skip = (Math.max(page, 1) - 1) * limit;
    const safeLim = Math.min(limit, 100); // cap at 100 to prevent abuse

    const [items, total] = await Promise.all([
      this.productModel
        .find()
        .sort({ createdAt: -1 })  // newest first
        .skip(skip)
        .limit(safeLim)
        .exec(),
      this.productModel.countDocuments().exec(),
    ]);

    return { items, total, page, limit: safeLim };
  }

  // --------------------------------------------------------
  // READ ONE -- Find a single product by its MongoDB _id
  //
  // NotFoundException is a NestJS built-in exception that
  // automatically returns HTTP 404 with a proper error body.
  // NestJS has exceptions for every HTTP status code:
  //   BadRequestException (400)
  //   UnauthorizedException (401)
  //   ForbiddenException (403)
  //   NotFoundException (404)
  //   ConflictException (409)
  //   InternalServerErrorException (500)
  // --------------------------------------------------------
  async findOne(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();
    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }
    return product;
  }

  // --------------------------------------------------------
  // UPDATE -- Modify an existing product
  //
  // findByIdAndUpdate() with { new: true } returns the UPDATED
  // document. Without { new: true }, it returns the OLD version.
  //
  // { runValidators: true } ensures Mongoose schema validations
  // (like min: 0 on price) are checked on updates too -- by
  // default, Mongoose only validates on create.
  // --------------------------------------------------------
  async update(id: string, data: UpdateProductDto): Promise<ProductDocument> {
    const product = await this.productModel
      .findByIdAndUpdate(id, data, {
        new: true,             // return updated document
        runValidators: true,   // validate on update too
      })
      .exec();

    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    this.logger.log(`Updated product: ${product._id}`);
    return product;
  }

  // --------------------------------------------------------
  // DELETE -- Remove a product from the database
  //
  // We find first (to throw 404 if missing), then delete.
  // In a real app, you might "soft delete" instead (set a
  // deletedAt timestamp) so data can be recovered.
  // --------------------------------------------------------
  async remove(id: string): Promise<void> {
    const result = await this.productModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }
    this.logger.log(`Deleted product: ${id}`);
  }
}

// ============================================================
// WHAT'S HAPPENING UNDER THE HOOD:
//
// 1. @Injectable() registers this class in NestJS's DI container
// 2. When ProductController is created, NestJS sees it needs
//    ProductService in its constructor
// 3. NestJS checks its container: "Do I have a ProductService?"
//    Yes -- it was declared in app.module.ts providers[]
// 4. NestJS creates ONE instance and injects it
// 5. The same instance is shared across the entire application
//    (singleton by default)
//
// WHY SINGLETONS:
// Database connections, loggers, and services are expensive to
// create. Sharing one instance is efficient and ensures consistent
// state. If you need per-request instances, use scope: Scope.REQUEST.
//
// Next lesson: Open src/product/product.schema.ts
// ============================================================
