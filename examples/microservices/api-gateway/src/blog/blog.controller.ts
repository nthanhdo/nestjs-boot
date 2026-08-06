import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { BlogGateway } from './blog.gateway';

class CreateArticleDto {
  title!: string;
  content!: string;
  excerpt?: string;
  author!: string;
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
}

class UpdateArticleDto {
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
}

@Controller('blog')
export class BlogController {
  constructor(private readonly blogGateway: BlogGateway) {}

  @Post('articles')
  createArticle(@Body() dto: CreateArticleDto) {
    return this.blogGateway.createArticle(dto);
  }

  @Put('articles/:id')
  updateArticle(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.blogGateway.updateArticle({ id, ...dto });
  }

  @Get('articles/:slug')
  getArticle(@Param('slug') slug: string) {
    return this.blogGateway.getArticle(slug);
  }

  @Get('articles')
  listArticles(
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.blogGateway.listArticles({
      category,
      tag,
      status,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Delete('articles/:id')
  deleteArticle(@Param('id') id: string) {
    return this.blogGateway.deleteArticle(id);
  }

  @Get('categories')
  listCategories() {
    return this.blogGateway.listCategories();
  }

  @Get('tags')
  listTags() {
    return this.blogGateway.listTags();
  }
}
