import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ProductService } from './product.service';

interface ProductById {
  id: string;
}

interface ProductFilter {
  category?: string;
  page?: number;
  limit?: number;
}

interface CreateProductRequest {
  name: string;
  price: number;
  category: string;
  stock: number;
}

@Controller()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @GrpcMethod('ProductService', 'FindOne')
  async findOne(data: ProductById) {
    const product = await this.productService.findOne(data.id);
    return {
      id: product._id?.toString(),
      name: product.name,
      price: product.price,
      category: product.category,
      stock: product.stock,
    };
  }

  @GrpcMethod('ProductService', 'FindAll')
  async findAll(data: ProductFilter) {
    const result = await this.productService.findAll(
      data.category,
      data.page,
      data.limit,
    );
    return {
      items: result.items.map((p) => ({
        id: p._id?.toString(),
        name: p.name,
        price: p.price,
        category: p.category,
        stock: p.stock,
      })),
      total: result.total,
    };
  }

  @GrpcMethod('ProductService', 'Create')
  async create(data: CreateProductRequest) {
    const product = await this.productService.create(data);
    return {
      id: product._id?.toString(),
      name: product.name,
      price: product.price,
      category: product.category,
      stock: product.stock,
    };
  }
}
