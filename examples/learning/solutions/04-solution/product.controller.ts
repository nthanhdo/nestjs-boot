// Solution 04: Auth guard on write endpoints
//
// Key changes:
// - @Public() only on GET endpoints (findAll, findOne)
// - POST, PUT, DELETE have NO @Public() -> require JWT token

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Public } from 'nestjs-boot';
import { ProductService } from '../../src/product/product.service';
import { CreateProductDto, UpdateProductDto } from '../../src/product/product.dto';

@Controller('products')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(private readonly productService: ProductService) {}

  @Public()    // <-- public: anyone can read
  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Public()    // <-- public: anyone can read one
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productService.findOne(id);
  }

  // NO @Public() -> requires valid JWT token
  @Post()
  async create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  // NO @Public() -> requires valid JWT token
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productService.update(id, dto);
  }

  // NO @Public() -> requires valid JWT token
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.productService.remove(id);
  }
}
