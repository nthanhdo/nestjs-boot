# Exercise 07: Call Product from Order (Internal Communication)

**Objective:** When creating an order, validate that the products exist and have enough stock.

## Context

In a monolith, you can call other services directly. In microservices, you'd use gRPC or HTTP. This exercise teaches the monolith approach (direct injection). Exercise covers both patterns.

## Steps

1. **Edit `src/order/order.service.ts`:**
   - Inject `ProductService` into OrderService's constructor
   - In `create()`, before saving the order:
     - Loop through `dto.items`
     - Call `productService.findOne(item.productId)` for each
     - Verify the product exists (findOne already throws 404 if not)
     - Verify stock >= quantity (throw BadRequestException if not)
     - Use the product's actual price (don't trust the client's price)
     - Decrease the product's stock

2. **Edit `src/app.module.ts`:**
   - Make sure both ProductService and OrderService are in `providers`
   - OrderService can now inject ProductService because they're in the same module

## Hints

```typescript
// In OrderService constructor:
constructor(
  @InjectModel('Order') private orderModel: Model<OrderDocument>,
  private readonly productService: ProductService,  // injected!
) {}

// In create():
for (const item of dto.items) {
  const product = await this.productService.findOne(item.productId);
  if (product.stock < item.quantity) {
    throw new BadRequestException(`Insufficient stock for "${product.name}"`);
  }
  // Use real price from DB, not client-provided price
  item.price = product.price;
}
```

## How to Verify

```bash
# Create a product with stock=5
# Try to order quantity=3 -> should work, stock becomes 2
# Try to order quantity=5 -> should fail (only 2 left)
# Try to order a non-existent productId -> should get 404
```

## Solution

Stuck? See [solutions/07-solution/](../solutions/07-solution/)
