import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { BlogService } from './blog.service';

interface CreateArticleRequest {
  title: string;
  content: string;
  excerpt?: string;
  author: string;
  category?: string;
  tags?: string[];
  coverImage?: string;
  seo?: { metaTitle?: string; metaDescription?: string; canonicalUrl?: string; ogImage?: string };
  status?: string;
}

interface UpdateArticleRequest {
  id: string;
  title?: string;
  content?: string;
  excerpt?: string;
  category?: string;
  tags?: string[];
  coverImage?: string;
  seo?: { metaTitle?: string; metaDescription?: string; canonicalUrl?: string; ogImage?: string };
  status?: string;
}

interface ArticleBySlug {
  slug: string;
}

interface ArticleById {
  id: string;
}

interface ListArticlesRequest {
  category?: string;
  tag?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

function toArticleResponse(article: any) {
  return {
    id: article._id?.toString() || article.id,
    title: article.title,
    slug: article.slug,
    content: article.content,
    excerpt: article.excerpt || '',
    author: article.author,
    category: article.category || '',
    tags: article.tags || [],
    status: article.status,
    coverImage: article.coverImage || '',
    seo: article.seo
      ? {
          metaTitle: article.seo.metaTitle || '',
          metaDescription: article.seo.metaDescription || '',
          canonicalUrl: article.seo.canonicalUrl || '',
          ogImage: article.seo.ogImage || '',
        }
      : { metaTitle: '', metaDescription: '', canonicalUrl: '', ogImage: '' },
    createdAt: article.createdAt?.toISOString?.() || article.createdAt || '',
    updatedAt: article.updatedAt?.toISOString?.() || article.updatedAt || '',
    viewCount: article.viewCount || 0,
  };
}

@Controller()
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @GrpcMethod('BlogService', 'CreateArticle')
  async createArticle(data: CreateArticleRequest) {
    const article = await this.blogService.createArticle(data);
    return toArticleResponse(article);
  }

  @GrpcMethod('BlogService', 'UpdateArticle')
  async updateArticle(data: UpdateArticleRequest) {
    const { id, ...rest } = data;
    const article = await this.blogService.updateArticle(id, rest);
    return toArticleResponse(article);
  }

  @GrpcMethod('BlogService', 'GetArticle')
  async getArticle(data: ArticleBySlug) {
    const article = await this.blogService.getArticle(data.slug);
    return toArticleResponse(article);
  }

  @GrpcMethod('BlogService', 'ListArticles')
  async listArticles(data: ListArticlesRequest) {
    const result = await this.blogService.listArticles(data);
    return {
      items: result.items.map(toArticleResponse),
      total: result.total,
    };
  }

  @GrpcMethod('BlogService', 'DeleteArticle')
  async deleteArticle(data: ArticleById) {
    const success = await this.blogService.deleteArticle(data.id);
    return { success };
  }

  @GrpcMethod('BlogService', 'ListCategories')
  async listCategories() {
    const categories = await this.blogService.listCategories();
    return { categories };
  }

  @GrpcMethod('BlogService', 'ListTags')
  async listTags() {
    const tags = await this.blogService.listTags();
    return { tags };
  }
}
