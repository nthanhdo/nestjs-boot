import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { ArticleDocument } from './schemas/article.schema';

/**
 * BlogService demonstrates nestjs-boot's CacheModule (L1+L2)
 * with cache-aside pattern for articles, categories, and tags.
 * Also showcases MongoDB full-text search for content queries.
 */
@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);

  constructor(
    @InjectModel('Article')
    private readonly articleModel: Model<ArticleDocument>,
    @Inject('CACHE_SERVICE')
    private readonly cache: {
      get<T>(key: string): Promise<T | null>;
      set(key: string, value: unknown, ttl?: number): Promise<void>;
      del(key: string): Promise<void>;
    },
  ) {}

  /**
   * Slugify a title: lowercase, replace spaces/special chars with hyphens,
   * remove non-alphanumeric (except hyphens), collapse multiple hyphens.
   */
  private slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Ensure slug uniqueness by appending a counter suffix if needed.
   */
  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    let counter = 0;
    while (await this.articleModel.exists({ slug })) {
      counter++;
      slug = `${base}-${counter}`;
    }
    return slug;
  }

  async createArticle(data: {
    title: string;
    content: string;
    excerpt?: string;
    author: string;
    category?: string;
    tags?: string[];
    coverImage?: string;
    seo?: {
      metaTitle?: string;
      metaDescription?: string;
      canonicalUrl?: string;
      ogImage?: string;
    };
    status?: string;
  }): Promise<ArticleDocument> {
    const slug = await this.uniqueSlug(this.slugify(data.title));
    const article = new this.articleModel({
      ...data,
      slug,
      status: data.status || 'draft',
      category: data.category || 'uncategorized',
      tags: data.tags || [],
      seo: data.seo || {},
    });

    const saved = await article.save();
    this.logger.log(`Article created: ${saved._id} "${saved.title}" [${saved.slug}]`);

    // Invalidate category/tag aggregate caches
    await this.invalidateAggregates();

    return saved;
  }

  async updateArticle(
    id: string,
    data: {
      title?: string;
      content?: string;
      excerpt?: string;
      category?: string;
      tags?: string[];
      coverImage?: string;
      seo?: {
        metaTitle?: string;
        metaDescription?: string;
        canonicalUrl?: string;
        ogImage?: string;
      };
      status?: string;
    },
  ): Promise<ArticleDocument> {
    const article = await this.articleModel.findById(id).exec();
    if (!article || article.status === 'deleted') {
      throw new NotFoundException(`Article ${id} not found`);
    }

    // If title changed, regenerate slug
    if (data.title && data.title !== article.title) {
      article.slug = await this.uniqueSlug(this.slugify(data.title));
      article.title = data.title;
    }

    if (data.content !== undefined) article.content = data.content;
    if (data.excerpt !== undefined) article.excerpt = data.excerpt;
    if (data.category !== undefined) article.category = data.category;
    if (data.tags !== undefined) article.tags = data.tags;
    if (data.coverImage !== undefined) article.coverImage = data.coverImage;
    if (data.status !== undefined)
      article.status = data.status as ArticleDocument['status'];
    if (data.seo) {
      article.seo = { ...article.seo, ...data.seo };
    }

    const saved = await article.save();
    this.logger.log(`Article updated: ${saved._id} "${saved.title}"`);

    // Invalidate caches for this article + aggregates
    await this.cache.del(`article:slug:${saved.slug}`);
    await this.invalidateAggregates();

    return saved;
  }

  /**
   * Cache-aside pattern: check cache → DB → populate cache.
   * Also increments viewCount on each fetch.
   */
  async getArticle(slug: string): Promise<ArticleDocument> {
    const cacheKey = `article:slug:${slug}`;

    // Check cache first (L1 in-memory → L2 Redis)
    const cached = await this.cache.get<ArticleDocument>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT for ${cacheKey}`);
      // Increment view count in background (fire-and-forget)
      this.articleModel
        .updateOne({ slug }, { $inc: { viewCount: 1 } })
        .exec()
        .catch(() => {});
      return cached;
    }

    const article = await this.articleModel.findOne({ slug }).exec();
    if (!article || article.status === 'deleted') {
      throw new NotFoundException(`Article with slug "${slug}" not found`);
    }

    // Increment view count
    article.viewCount += 1;
    await article.save();

    // Populate cache (5 minute TTL)
    await this.cache.set(cacheKey, article.toObject(), 300);
    this.logger.debug(`Cache MISS for ${cacheKey}, populated`);

    return article;
  }

  async listArticles(params: {
    category?: string;
    tag?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: ArticleDocument[]; total: number }> {
    const filter: FilterQuery<ArticleDocument> = {};
    const page = Math.max(params.page || 1, 1);
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const skip = (page - 1) * limit;

    // Exclude deleted by default
    filter.status = params.status || { $ne: 'deleted' };
    if (params.category) filter.category = params.category;
    if (params.tag) filter.tags = params.tag;

    // Full-text search via MongoDB text index
    if (params.search) {
      filter.$text = { $search: params.search };
    }

    const [items, total] = await Promise.all([
      this.articleModel
        .find(filter)
        .sort(params.search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.articleModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async deleteArticle(id: string): Promise<boolean> {
    const article = await this.articleModel.findById(id).exec();
    if (!article) {
      throw new NotFoundException(`Article ${id} not found`);
    }

    // Soft-delete: set status to 'deleted'
    article.status = 'deleted';
    await article.save();

    // Invalidate caches
    await this.cache.del(`article:slug:${article.slug}`);
    await this.invalidateAggregates();

    this.logger.log(`Article soft-deleted: ${id} "${article.title}"`);
    return true;
  }

  /**
   * Aggregate distinct categories from all non-deleted articles.
   * Cached heavily (10 minute TTL) since categories change infrequently.
   */
  async listCategories(): Promise<string[]> {
    const cacheKey = 'blog:categories';

    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT for ${cacheKey}`);
      return cached;
    }

    const categories = await this.articleModel.distinct('category', {
      status: { $ne: 'deleted' },
    });

    await this.cache.set(cacheKey, categories, 600); // 10 min TTL
    this.logger.debug(`Cache MISS for ${cacheKey}, populated (${categories.length} categories)`);

    return categories;
  }

  /**
   * Aggregate distinct tags from all non-deleted articles.
   * Cached heavily (10 minute TTL).
   */
  async listTags(): Promise<string[]> {
    const cacheKey = 'blog:tags';

    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT for ${cacheKey}`);
      return cached;
    }

    const tags = await this.articleModel.distinct('tags', {
      status: { $ne: 'deleted' },
    });

    await this.cache.set(cacheKey, tags, 600); // 10 min TTL
    this.logger.debug(`Cache MISS for ${cacheKey}, populated (${tags.length} tags)`);

    return tags;
  }

  private async invalidateAggregates(): Promise<void> {
    await Promise.all([
      this.cache.del('blog:categories'),
      this.cache.del('blog:tags'),
    ]);
  }
}
