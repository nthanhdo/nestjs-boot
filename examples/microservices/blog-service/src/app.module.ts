import { Module } from '@nestjs/common';
import { DatabaseModule } from 'nestjs-boot';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { Article, ArticleSchema } from './schemas/article.schema';

@Module({
  imports: [
    DatabaseModule.forFeature('master', [
      { name: Article.name, schema: ArticleSchema },
    ]),
  ],
  controllers: [BlogController],
  providers: [BlogService],
})
export class AppModule {}
