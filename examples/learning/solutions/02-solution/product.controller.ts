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
import { ProductService } from './product.service';
import { CreateProductDto, UpdateProductDto } from '../../src/product/product.dto';

@Controller('products')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(private readonly productService: ProductService) {}

  // CHANGED: cursor-based pagination
  @Public()
  @Get()
  async findAll(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,   // <-- cursor instead of page
  ) {
    return this.productService.findAll(
      limit ? parseInt(limit, 10) : 20,
      cursor,
    );
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.productService.remove(id);
  }
}
