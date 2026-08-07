// ============================================================
// LESSON 9: User Model
// ============================================================
//
// The User schema stores authentication data. Notice how it
// differs from the Product schema:
//
//   - `unique: true` on email -- MongoDB enforces no duplicates
//   - `lowercase: true` -- "Alice@Example.COM" -> "alice@example.com"
//   - passwordHash is stored, NEVER the plain password
//   - refreshToken is stored for token rotation + revocation
//   - roles array enables RBAC (Role-Based Access Control)
//
// SECURITY CONSIDERATIONS:
//   1. passwordHash should never appear in API responses
//   2. refreshToken should never appear in API responses
//   3. Use .select('-passwordHash -refreshToken') in queries
//      that return user data to clients
//   4. The unique index on email prevents race conditions
//      (two concurrent registrations with the same email)
// ============================================================

import { Schema, Document } from 'mongoose';

export interface UserDocument extends Document {
  email: string;
  passwordHash: string;
  name: string;
  roles: string[];
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,       // MongoDB unique index -- prevents duplicate emails
      lowercase: true,    // normalize to lowercase before saving
      trim: true,         // remove whitespace
    },
    passwordHash: {
      type: String,
      required: true,
      // NOTE: This is the bcrypt hash, NOT the plain password.
      // bcrypt hashes look like: $2b$10$N9qo8uLOickgx2ZMRZoMye...
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    roles: {
      type: [String],     // array of strings
      default: ['user'],  // new users get 'user' role by default
      // Common roles: 'user', 'admin', 'moderator'
      // Exercise 05 will have you implement role-based access control
    },
    refreshToken: {
      type: String,
      default: null,
      // Stored in DB so we can:
      //   1. Verify it hasn't been revoked
      //   2. Rotate it on each refresh (old token becomes invalid)
      //   3. Invalidate all sessions by setting to null (logout)
    },
  },
  { timestamps: true },
);

// --------------------------------------------------------
// Indexes
//
// The unique constraint on email already creates an index.
// We don't need to add another one explicitly.
//
// If you were building a multi-tenant app, you might add:
//   UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
// --------------------------------------------------------

export const User = { name: 'User' };

// ============================================================
// NEXT STEPS:
//
// You've now seen the complete auth flow:
//   1. User schema (this file) -- data structure
//   2. Auth service (auth.service.ts) -- business logic
//   3. Auth controller (auth.controller.ts) -- HTTP endpoints
//   4. JWT config (main.ts) -- secrets + expiration
//
// The pattern is always the same:
//   Schema -> Service -> Controller -> Config
//
// Next lesson: Open src/cache/cached-product.service.ts
// ============================================================
