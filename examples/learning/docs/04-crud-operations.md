# 04 - CRUD Operations

CRUD = Create, Read, Update, Delete. These four operations cover 90% of API endpoints.

## The Pattern

Every CRUD resource follows the same structure:

```
Schema (data shape) -> Service (logic) -> Controller (HTTP) -> DTO (validation)
```

## REST Conventions

| Operation | HTTP Method | URL | Status Code |
|-----------|-------------|-----|-------------|
| Create | POST | /products | 201 Created |
| Read all | GET | /products | 200 OK |
| Read one | GET | /products/:id | 200 OK |
| Update | PUT | /products/:id | 200 OK |
| Delete | DELETE | /products/:id | 204 No Content |

## Implementation in This Project

Open `src/product/product.controller.ts` and `src/product/product.service.ts` side by side.

**Controller** (thin -- just routing):
```typescript
@Post()
async create(@Body() dto: CreateProductDto) {
  return this.productService.create(dto);
}
```

**Service** (where the work happens):
```typescript
async create(data: CreateProductDto): Promise<ProductDocument> {
  const product = new this.productModel(data);
  return product.save();
}
```

## Pagination

Returning ALL records is dangerous -- a collection with 1 million documents would crash the client. Always paginate:

```typescript
async findAll(page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    this.productModel.find().skip(skip).limit(limit).exec(),
    this.productModel.countDocuments().exec(),
  ]);
  return { items, total, page, limit };
}
```

## Error Handling

NestJS provides built-in exception classes:

```typescript
if (!product) {
  throw new NotFoundException(`Product "${id}" not found`);
  // -> HTTP 404 { statusCode: 404, message: '...', error: 'Not Found' }
}
```

## Try It Yourself

```bash
# Create
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"USB Cable","price":9.99,"stock":200}'

# Read all
curl http://localhost:3000/products

# Read one (replace ID)
curl http://localhost:3000/products/<id-from-create>

# Update
curl -X PUT http://localhost:3000/products/<id> \
  -H "Content-Type: application/json" \
  -d '{"price":7.99}'

# Delete
curl -X DELETE http://localhost:3000/products/<id>
# -> 204 No Content (empty response body)

# Try reading the deleted product
curl http://localhost:3000/products/<id>
# -> 404 Not Found
```

## Exercise

Try [Exercise 02: Add Pagination](../exercises/02-add-pagination.md)

---

Next: [05 - Validation](05-validation.md)
