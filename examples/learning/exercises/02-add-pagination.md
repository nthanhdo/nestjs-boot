# Exercise 02: Add Cursor-Based Pagination

**Objective:** Replace offset-based pagination with cursor-based pagination.

## Context

Offset pagination (`skip(100).limit(20)`) gets slower as the offset grows because MongoDB must scan and skip all preceding documents. Cursor-based pagination uses the `_id` of the last item as a bookmark, which is consistently fast.

## Steps

1. **Edit `src/product/product.service.ts`:**
   - Change `findAll` to accept an optional `cursor` (the `_id` of the last item seen) instead of `page`
   - When a cursor is provided, query `{ _id: { $lt: cursor } }` (for descending sort)
   - Return `{ items, nextCursor, hasMore }` instead of `{ items, total, page }`

2. **Edit `src/product/product.controller.ts`:**
   - Change the `@Query` parameter from `page` to `cursor`
   - Pass cursor to the service

3. **Test:**

```bash
# First page (no cursor)
curl "http://localhost:3000/products?limit=2"

# Next page (use the last item's _id as cursor)
curl "http://localhost:3000/products?limit=2&cursor=<last-id>"
```

## Hints

- MongoDB ObjectIds are time-sortable, so `{ _id: { $lt: cursor } }` with `.sort({ _id: -1 })` gives you the next page
- `hasMore = items.length === limit` (if you got a full page, there might be more)
- `nextCursor = items[items.length - 1]?._id` (the last item's ID)

## How to Verify

Create 5 products, then paginate with `limit=2`. You should get 3 pages (2, 2, 1 items).

## Solution

Stuck? See [solutions/02-solution/](../solutions/02-solution/)
