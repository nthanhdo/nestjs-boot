import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

interface SEOMeta {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogImage: string;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  author: string;
  category: string;
  tags: string[];
  status: string;
  coverImage: string;
  seo: SEOMeta;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
}

interface ArticleList {
  items: Article[];
  total: number;
}

interface CategoryList {
  categories: string[];
}

interface TagList {
  tags: string[];
}

interface DeleteResponse {
  success: boolean;
}

interface BlogServiceGrpc {
  createArticle(data: {
    title: string;
    content: string;
    excerpt?: string;
    author: string;
    category?: string;
    tags?: string[];
    coverImage?: string;
    seo?: Partial<SEOMeta>;
    status?: string;
  }): Observable<Article>;
  updateArticle(data: {
    id: string;
    title?: string;
    content?: string;
    excerpt?: string;
    category?: string;
    tags?: string[];
    coverImage?: string;
    seo?: Partial<SEOMeta>;
    status?: string;
  }): Observable<Article>;
  getArticle(data: { slug: string }): Observable<Article>;
  listArticles(data: {
    category?: string;
    tag?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Observable<ArticleList>;
  deleteArticle(data: { id: string }): Observable<DeleteResponse>;
  listCategories(data: Record<string, never>): Observable<CategoryList>;
  listTags(data: Record<string, never>): Observable<TagList>;
}

@Injectable()
export class BlogGateway implements OnModuleInit {
  private blogService!: BlogServiceGrpc;

  constructor(
    @Inject('BLOG_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.blogService =
      this.client.getService<BlogServiceGrpc>('BlogService');
  }

  createArticle(data: {
    title: string;
    content: string;
    excerpt?: string;
    author: string;
    category?: string;
    tags?: string[];
    coverImage?: string;
    seo?: Partial<SEOMeta>;
    status?: string;
  }): Observable<Article> {
    return this.blogService.createArticle(data);
  }

  updateArticle(data: {
    id: string;
    title?: string;
    content?: string;
    excerpt?: string;
    category?: string;
    tags?: string[];
    coverImage?: string;
    seo?: Partial<SEOMeta>;
    status?: string;
  }): Observable<Article> {
    return this.blogService.updateArticle(data);
  }

  getArticle(slug: string): Observable<Article> {
    return this.blogService.getArticle({ slug });
  }

  listArticles(params: {
    category?: string;
    tag?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Observable<ArticleList> {
    return this.blogService.listArticles(params);
  }

  deleteArticle(id: string): Observable<DeleteResponse> {
    return this.blogService.deleteArticle({ id });
  }

  listCategories(): Observable<CategoryList> {
    return this.blogService.listCategories({} as Record<string, never>);
  }

  listTags(): Observable<TagList> {
    return this.blogService.listTags({} as Record<string, never>);
  }
}
