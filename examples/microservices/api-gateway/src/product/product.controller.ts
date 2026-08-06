import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ProductGateway } from './product.gateway';

class CreateProductDto {
  name!: string;
  price!: number;
  category!: string;
  stock!: number;
}

@Controller('products')
export class ProductController {
  constructor(private readonly productGateway: ProductGateway) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productGateway.findOne(id);
  }

  @Get()
  findAll(
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productGateway.findAll(
      category,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productGateway.create(dto);
  }
}
