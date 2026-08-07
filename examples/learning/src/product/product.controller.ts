// ============================================================
// LESSON 3: REST Endpoints + Decorators
// ============================================================
//
// A Controller is a class that handles incoming HTTP requests
// and returns responses. Decorators map methods to HTTP verbs + paths.
//
// Decorator cheat sheet:
//   @Controller('products')  -> prefix all routes with /products
//   @Get()                   -> GET /products
//   @Get(':id')              -> GET /products/123
//   @Post()                  -> POST /products
//   @Put(':id')              -> PUT /products/123
//   @Delete(':id')           -> DELETE /products/123
//   @Param('id')             -> extract :id from URL
//   @Body()                  -> extract JSON body
//   @Query('page')           -> extract ?page=2 from query string
//
// WHY DECORATORS:
// Express uses app.get('/products', handler). NestJS decorators do
// the same thing but keep route info RIGHT NEXT TO the handler,
// making it easier to read and maintain.
//
// NESTJS-BOOT CONNECTION:
// The @Public() decorator comes from nestjs-boot. When auth is
// enabled, ALL endpoints require a JWT token by default. @Public()
// marks specific endpoints as accessible without authentication.
// ============================================================

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
import { CreateProductDto, UpdateProductDto } from './product.dto';

@Controller('products')
export class ProductController {
  // NestJS Logger -- use this instead of console.log in production.
  // It adds timestamps, context (class name), and log levels.
  private readonly logger = new Logger(ProductController.name);

  // --------------------------------------------------------
  // DEPENDENCY INJECTION (DI)
  //
  // NestJS sees `private readonly productService: ProductService`
  // in the constructor and automatically creates + injects an
  // instance of ProductService.
  //
  // You NEVER write `new ProductService()` -- NestJS handles it.
  // This makes testing easy: in tests, you can inject a mock.
  // --------------------------------------------------------
  constructor(private readonly productService: ProductService) {}

  // --------------------------------------------------------
  // GET /products -- List all products
  //
  // @Public() means no JWT token required.
  // @Query() extracts query parameters: /products?page=2&limit=10
  //
  // TRY IT:
  //   curl http://localhost:3000/products
  //   curl "http://localhost:3000/products?page=1&limit=5"
  // --------------------------------------------------------
  @Public()
  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.log(`GET /products page=${page} limit=${limit}`);
    return this.productService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  // --------------------------------------------------------
  // GET /products/:id -- Get one product by ID
  //
  // @Param('id') extracts the :id segment from the URL.
  // For /products/abc123, id = 'abc123'
  //
  // TRY IT:
  //   curl http://localhost:3000/products/<some-id>
  // --------------------------------------------------------
  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    this.logger.log(`GET /products/${id}`);
    return this.productService.findOne(id);
  }

  // --------------------------------------------------------
  // POST /products -- Create a new product
  //
  // @Body() extracts the JSON body and passes it as the `dto` parameter.
  // The CreateProductDto class (product.dto.ts) defines what fields
  // are expected and validates them automatically.
  //
  // NOTE: No @Public() here -- this endpoint requires a JWT token
  // (when auth is enabled). Only authenticated users can create products.
  //
  // TRY IT (without auth, uncomment @Public() to test):
  //   curl -X POST http://localhost:3000/products \
  //     -H "Content-Type: application/json" \
  //     -d '{"name":"Wireless Mouse","price":29.99,"stock":100}'
  // --------------------------------------------------------
  @Post()
  async create(@Body() dto: CreateProductDto) {
    this.logger.log(`POST /products: ${dto.name}`);
    return this.productService.create(dto);
  }

  // --------------------------------------------------------
  // PUT /products/:id -- Update a product
  //
  // Combines @Param for the ID and @Body for the update data.
  // UpdateProductDto makes all fields optional (Partial<CreateProductDto>).
  // --------------------------------------------------------
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    this.logger.log(`PUT /products/${id}`);
    return this.productService.update(id, dto);
  }

  // --------------------------------------------------------
  // DELETE /products/:id -- Delete a product
  //
  // @HttpCode(204) returns "No Content" instead of the default 200.
  // This is the REST convention for successful deletes -- the
  // resource is gone, so there's nothing to return.
  // --------------------------------------------------------
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    this.logger.log(`DELETE /products/${id}`);
    await this.productService.remove(id);
  }
}

// ============================================================
// WHAT'S HAPPENING UNDER THE HOOD:
//
// 1. @Controller('products') tells NestJS: "register all routes
//    in this class under the /products prefix"
// 2. NestJS scans each method for @Get/@Post/@Put/@Delete decorators
// 3. It builds a route table: GET /products -> findAll(), etc.
// 4. When a request arrives, NestJS:
//    a. Runs global guards (JwtAuthGuard checks for Bearer token)
//    b. Checks if method has @Public() -- if yes, skip auth
//    c. Runs validation pipes on @Body() (if configured)
//    d. Calls your method
//    e. Serializes the return value to JSON
//    f. Sends the HTTP response
//
// Next lesson: Open src/product/product.service.ts
// ============================================================
