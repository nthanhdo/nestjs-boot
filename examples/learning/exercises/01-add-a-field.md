# Exercise 01: Add a Field

**Objective:** Add a `category` field to the Product model.

## Context

Products need categories for filtering and organization. This exercise teaches you how to modify a schema, update DTOs, and verify the change end-to-end.

## Steps

1. **Edit `src/product/product.schema.ts`:**
   - Add a `category` field: type `String`, required, with an index
   - Add `category` to the `ProductDocument` interface

2. **Edit `src/product/product.dto.ts`:**
   - Add `category` to `CreateProductDto` with `@IsString()` validation
   - Add `category` to `UpdateProductDto` as optional

3. **Test your changes:**

```bash
# Restart the server
npm run start:dev

# Create a product with category
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Gaming Mouse","price":59.99,"stock":50,"category":"electronics"}'

# Verify category appears in the response
curl http://localhost:3000/products
```

## Hints

- Look at how `name` is defined in the schema -- `category` follows the same pattern
- Remember to add the field to BOTH the TypeScript interface AND the Mongoose schema
- The DTO and schema can have different validation rules

## How to Verify

```bash
# This should succeed and include "category" in the response:
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","price":10,"category":"test-category"}'

# This should fail (category is required):
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","price":10}'
```

## Solution

Stuck? See [solutions/01-solution/](../solutions/01-solution/)
