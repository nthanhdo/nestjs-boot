# Exercise 04: Protect Endpoints with JWT

**Objective:** Make `POST`, `PUT`, and `DELETE` product endpoints require authentication while keeping `GET` endpoints public.

## Context

Currently, the product controller has `@Public()` on read endpoints. Write endpoints (create, update, delete) should require a valid JWT token so only logged-in users can modify products.

## Steps

1. **Verify auth is configured** in `main.ts` (it already is).

2. **Edit `src/product/product.controller.ts`:**
   - Ensure `@Public()` is ONLY on `findAll()` and `findOne()` -- NOT on `create()`, `update()`, or `remove()`
   - The `create()` method in the starter code already lacks `@Public()`, so it should already require auth

3. **Test the full flow:**

```bash
# 1. Register a user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass123","name":"Test"}'

# 2. Login and save the token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# 3. Create product WITH token (should work)
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Auth Test","price":10}'

# 4. Create product WITHOUT token (should get 401)
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"No Auth","price":10}'

# 5. GET products WITHOUT token (should work -- it's @Public)
curl http://localhost:3000/products
```

## How to Verify

- `GET /products` works without a token
- `POST /products` returns 401 without a token
- `POST /products` works with a valid Bearer token
- `PUT /products/:id` returns 401 without a token
- `DELETE /products/:id` returns 401 without a token

## Solution

Stuck? See [solutions/04-solution/](../solutions/04-solution/)
