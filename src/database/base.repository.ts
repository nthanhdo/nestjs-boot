import { Model, FilterQuery, PipelineStage, Document, UpdateQuery } from 'mongoose';

/**
 * Paginated result set.
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Options for findAll queries.
 */
export interface FindAllOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
  select?: string | Record<string, 1 | 0>;
}

/**
 * Generic base repository with reader/writer split.
 *
 * - All READ operations use the reader model (if available), else writer.
 * - All WRITE operations always use the writer model.
 */
export class BaseRepository<T extends Document> {
  protected readonly readerModel: Model<T> | null;
  protected readonly writerModel: Model<T>;

  constructor(writerModel: Model<T>, readerModel?: Model<T>) {
    this.writerModel = writerModel;
    this.readerModel = readerModel ?? null;
  }

  /**
   * The model used for read operations.
   */
  protected get readModel(): Model<T> {
    return this.readerModel ?? this.writerModel;
  }

  /**
   * Find all documents matching filter with pagination.
   */
  async findAll(
    filter: FilterQuery<T> = {},
    options: FindAllOptions = {},
  ): Promise<PaginatedResult<T>> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const query = this.readModel.find(filter).skip(skip).limit(limit);

    if (options.sort) {
      query.sort(options.sort);
    }
    if (options.select) {
      query.select(options.select);
    }

    const [data, total] = await Promise.all([
      query.exec() as Promise<T[]>,
      this.readModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Find a document by its ID.
   */
  async findById(id: string): Promise<T | null> {
    return this.readModel.findById(id).exec();
  }

  /**
   * Find one document matching filter.
   */
  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    return this.readModel.findOne(filter).exec();
  }

  /**
   * Create a new document.
   */
  async create(data: Partial<T>): Promise<T> {
    const doc = new this.writerModel(data);
    return doc.save();
  }

  /**
   * Create multiple documents.
   */
  async createMany(data: Partial<T>[]): Promise<T[]> {
    return this.writerModel.insertMany(data) as unknown as T[];
  }

  /**
   * Update a document by ID.
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    return this.writerModel
      .findByIdAndUpdate(id, data as UpdateQuery<T>, { new: true })
      .exec();
  }

  /**
   * Update multiple documents matching filter.
   */
  async updateMany(
    filter: FilterQuery<T>,
    data: Partial<T>,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.writerModel
      .updateMany(filter, data as UpdateQuery<T>)
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Delete a document by ID.
   */
  async delete(id: string): Promise<T | null> {
    return this.writerModel.findByIdAndDelete(id).exec();
  }

  /**
   * Delete multiple documents matching filter.
   */
  async deleteMany(filter: FilterQuery<T>): Promise<{ deletedCount: number }> {
    const result = await this.writerModel.deleteMany(filter).exec();
    return { deletedCount: result.deletedCount };
  }

  /**
   * Count documents matching filter.
   */
  async count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.readModel.countDocuments(filter).exec();
  }

  /**
   * Run an aggregation pipeline.
   */
  async aggregate(pipeline: PipelineStage[]): Promise<unknown[]> {
    return this.readModel.aggregate(pipeline).exec();
  }

  /**
   * Check if a document matching filter exists.
   */
  async exists(filter: FilterQuery<T>): Promise<boolean> {
    const result = await this.readModel.exists(filter);
    return result !== null;
  }
}
