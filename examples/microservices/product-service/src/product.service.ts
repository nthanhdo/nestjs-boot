import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProductDocument } from './schemas/product.schema';

/**
 * ProductService demonstrates nestjs-boot's CacheModule (L1+L2)
 * with manual cache-aside pattern for gRPC service methods.
 */
@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectModel('Product') private readonly productModel: Model<ProductDocument>,
    @Inject('CACHE_SERVICE') private readonly cache: {
      get<T>(key: string): Promise<T | null>;
      set(key: string, value: unknown, ttl?: number): Promise<void>;
      del(key: string): Promise<void>;
    },
  ) {}

  async findOne(id: string): Promise<ProductDocument> {
    const cacheKey = `product:${id}`;

    // Check cache first (L1 in-memory -> L2 Redis)
    const cached = await this.cache.get<ProductDocument>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT for ${cacheKey}`);
      return cached;
    }

    const product = await this.productModel.findById(id).exec();
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    // Populate cache (5 minute TTL)
    await this.cache.set(cacheKey, product.toObject(), 300);
    this.logger.debug(`Cache MISS for ${cacheKey}, populated`);

    return product;
  }

  async findAll(
    category?: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: ProductDocument[]; total: number }> {
    const filter = category ? { category } : {};
    const skip = (Math.max(page, 1) - 1) * limit;

    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(limit, 100))
        .exec(),
      this.productModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async create(data: {
    name: string;
    price: number;
    category: string;
    stock: number;
  }): Promise<ProductDocument> {
    const product = new this.productModel(data);
    const saved = await product.save();
    this.logger.log(`Product created: ${saved._id} "${saved.name}"`);
    return saved;
  }
}
