import { Module } from '@nestjs/common';
import { DatabaseModule } from 'nestjs-boot';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { Product, ProductSchema } from './schemas/product.schema';

@Module({
  imports: [
    DatabaseModule.forFeature('master', [
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [ProductController],
  providers: [ProductService],
})
export class AppModule {}
