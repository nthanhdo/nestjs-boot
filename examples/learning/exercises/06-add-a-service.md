# Exercise 06: Create an Order Service

**Objective:** Build a new `Order` feature from scratch following the same pattern as Product.

## Context

This is where it all comes together. You'll create a complete feature: schema, service, controller, and DTOs. An Order has items (product references), a total, and a status.

## Steps

1. **Create `src/order/order.schema.ts`:**
   - Fields: `items` (array of `{ productId: string, quantity: number, price: number }`), `total` (Number), `status` (String, enum: `pending`, `confirmed`, `shipped`, `delivered`), `userId` (String)
   - Add `timestamps: true`

2. **Create `src/order/order.dto.ts`:**
   - `CreateOrderDto`: `items` array (required), validate each item has productId, quantity, price

3. **Create `src/order/order.service.ts`:**
   - `create(userId, dto)`: calculate total from items, save order
   - `findAll(userId)`: return orders for a specific user
   - `findOne(id)`: return one order
   - `updateStatus(id, status)`: update order status (admin only)

4. **Create `src/order/order.controller.ts`:**
   - `POST /orders` -- create order (auth required, get userId from req.user)
   - `GET /orders` -- list my orders (auth required)
   - `GET /orders/:id` -- get one order
   - `PATCH /orders/:id/status` -- update status (admin only)

5. **Register in `src/app.module.ts`:**
   - Add Order schema to `DatabaseModule.forFeature()`
   - Add OrderController and OrderService

## Hints

- Follow the exact same pattern as Product (schema -> service -> controller -> DTO)
- Get `userId` from `req.user.sub` (the JWT payload)
- Calculate total: `items.reduce((sum, item) => sum + item.price * item.quantity, 0)`

## How to Verify

```bash
# Login first, then:
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"items":[{"productId":"abc","quantity":2,"price":29.99}]}'

curl http://localhost:3000/orders \
  -H "Authorization: Bearer $TOKEN"
```

## Solution

Stuck? See [solutions/06-solution/](../solutions/06-solution/)
