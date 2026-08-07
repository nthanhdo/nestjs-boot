# Exercise 05: Add Role-Based Access Control (RBAC)

**Objective:** Only `admin` users can delete products. Regular `user` role can create and update.

## Context

Authentication tells you WHO someone is. Authorization tells you WHAT they can do. nestjs-boot provides `@Roles()` decorator and `RolesGuard` for role-based access.

## Steps

1. **Enable RBAC** in `main.ts`:

```typescript
auth: {
  jwt: { ... },
  rbac: {
    enabled: true,
    extractRoles: (request) => request.user?.roles || [],
  },
},
```

2. **Edit `src/product/product.controller.ts`:**
   - Import `Roles` from `nestjs-boot`
   - Add `@Roles('admin')` to the `remove()` method
   - Leave `create()` and `update()` without `@Roles` (any authenticated user)

3. **Test:**

```bash
# Register a regular user (default role: 'user')
# Try to DELETE a product -> should get 403 Forbidden

# To test admin: manually update the user's roles in MongoDB:
#   db.users.updateOne({ email: 'admin@example.com' }, { $set: { roles: ['admin'] } })
# Then login as admin and try DELETE -> should work
```

## Hints

- `@Roles('admin')` means "only users whose JWT payload has `roles: ['admin']`"
- The `extractRoles` function in the RBAC config tells nestjs-boot where to find roles in the request
- You can use MongoDB Compass or `mongosh` to manually set a user's roles

## How to Verify

- Regular user: POST works, DELETE returns 403
- Admin user: POST works, DELETE works

## Solution

Stuck? See [solutions/05-solution/](../solutions/05-solution/)
