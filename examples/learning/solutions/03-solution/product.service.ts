import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProductDocument } from '../../src/product/product.schema';
import { CreateProductDto, UpdateProductDto } from '../../src/product/product.dto';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectModel('Product')
    private readonly productModel: Model<ProductDocument>,

    // ADDED: inject nestjs-boot's cache service
    @Inject('CACHE_SERVICE')
    private readonly cache: {
      get<T>(key: string): Promise<T | undefined>;
      set(key: string, value: unknown, ttl?: number): Promise<void>;
      del(key: string): Promise<void>;
    },
  ) {}

  async create(data: CreateProductDto): Promise<ProductDocument> {
    const product = new this.productModel(data);
    const saved = await product.save();
    this.logger.log(`Created product: ${saved._id} "${saved.name}"`);
    return saved;
  }

  async findAll(
    page = 1,
    limit = 20,
  ): Promise<{ items: ProductDocument[]; total: number; page: number; limit: number }> {
    const skip = (Math.max(page, 1) - 1) * limit;
    const safeLim = Math.min(limit, 100);

    const [items, total] = await Promise.all([
      this.productModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLim)
        .exec(),
      this.productModel.countDocuments().exec(),
    ]);

    return { items, total, page, limit: safeLim };
  }

  // CHANGED: added cache-aside pattern
  async findOne(id: string): Promise<ProductDocument> {
    const cacheKey = `product:${id}`;

    // Check cache first
    const cached = await this.cache.get<ProductDocument>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT: ${cacheKey}`);
      return cached;
    }

    // Cache miss -- query database
    this.logger.debug(`Cache MISS: ${cacheKey}`);
    const product = await this.productModel.findById(id).exec();
    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    // Populate cache (5 min TTL)
    await this.cache.set(cacheKey, product.toObject(), 300);

    return product;
  }

  // CHANGED: invalidate cache on update
  async update(id: string, data: UpdateProductDto): Promise<ProductDocument> {
    const product = await this.productModel
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .exec();

    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    // Invalidate stale cache
    await this.cache.del(`product:${id}`);
    this.logger.debug(`Cache INVALIDATED: product:${id}`);
    this.logger.log(`Updated product: ${product._id}`);

    return product;
  }

  // CHANGED: invalidate cache on delete
  async remove(id: string): Promise<void> {
    const result = await this.productModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    await this.cache.del(`product:${id}`);
    this.logger.debug(`Cache INVALIDATED: product:${id}`);
    this.logger.log(`Deleted product: ${id}`);
  }
}
