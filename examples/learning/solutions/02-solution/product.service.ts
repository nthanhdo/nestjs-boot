import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductDocument } from '../../src/product/product.schema';
import { CreateProductDto, UpdateProductDto } from '../../src/product/product.dto';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectModel('Product')
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async create(data: CreateProductDto): Promise<ProductDocument> {
    const product = new this.productModel(data);
    const saved = await product.save();
    this.logger.log(`Created product: ${saved._id} "${saved.name}"`);
    return saved;
  }

  // CHANGED: cursor-based pagination instead of offset-based
  async findAll(
    limit = 20,
    cursor?: string,
  ): Promise<{ items: ProductDocument[]; nextCursor: string | null; hasMore: boolean }> {
    const safeLim = Math.min(limit, 100);

    // Build filter: if cursor provided, get items BEFORE that ID (descending order)
    const filter = cursor
      ? { _id: { $lt: new Types.ObjectId(cursor) } }
      : {};

    const items = await this.productModel
      .find(filter)
      .sort({ _id: -1 })        // newest first (ObjectIds are time-sortable)
      .limit(safeLim)
      .exec();

    const hasMore = items.length === safeLim;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1]._id!.toString()
      : null;

    return { items, nextCursor, hasMore };
  }

  async findOne(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();
    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }
    return product;
  }

  async update(id: string, data: UpdateProductDto): Promise<ProductDocument> {
    const product = await this.productModel
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .exec();
    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }
    this.logger.log(`Updated product: ${product._id}`);
    return product;
  }

  async remove(id: string): Promise<void> {
    const result = await this.productModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }
    this.logger.log(`Deleted product: ${id}`);
  }
}
