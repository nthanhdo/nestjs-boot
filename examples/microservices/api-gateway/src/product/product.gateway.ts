import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
}

interface ProductList {
  items: Product[];
  total: number;
}

interface ProductServiceGrpc {
  findOne(data: { id: string }): Observable<Product>;
  findAll(data: { category?: string; page?: number; limit?: number }): Observable<ProductList>;
  create(data: { name: string; price: number; category: string; stock: number }): Observable<Product>;
}

@Injectable()
export class ProductGateway implements OnModuleInit {
  private productService!: ProductServiceGrpc;

  constructor(
    @Inject('PRODUCT_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.productService = this.client.getService<ProductServiceGrpc>('ProductService');
  }

  findOne(id: string): Observable<Product> {
    return this.productService.findOne({ id });
  }

  findAll(category?: string, page = 1, limit = 20): Observable<ProductList> {
    return this.productService.findAll({ category, page, limit });
  }

  create(data: { name: string; price: number; category: string; stock: number }): Observable<Product> {
    return this.productService.create(data);
  }
}
