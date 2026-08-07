// ============================================================
// LESSON 8: JWT + bcrypt
// ============================================================
//
// This service handles the LOGIC of authentication:
//   - Hashing passwords (never store plain text!)
//   - Verifying credentials
//   - Signing + verifying JWT tokens
//
// KEY CONCEPTS:
//
// PASSWORD HASHING (bcrypt):
//   bcrypt.hash('secret123', 10) -> '$2b$10$...' (irreversible)
//   bcrypt.compare('secret123', hash) -> true/false
//   Even if your database leaks, attackers can't read passwords.
//   The '10' is the salt rounds (cost factor) -- higher = slower + safer.
//
// JWT (JSON Web Token):
//   A signed string like: eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0.SflKxwRJS
//   Three parts separated by dots:
//     Header: { alg: 'HS256', typ: 'JWT' }
//     Payload: { sub: 'userId', email: 'alice@ex.com', exp: 1234567 }
//     Signature: HMAC(header + payload, secret)
//   Anyone can READ the payload (it's base64, not encrypted).
//   Only the server can VERIFY it (needs the secret).
//
// NESTJS-BOOT CONNECTION:
// BootJwtService is provided by nestjs-boot when auth.jwt is configured.
// It wraps jsonwebtoken with your configured secret + options.
// ============================================================

import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BootJwtService } from 'nestjs-boot';
import * as bcrypt from 'bcrypt';
import { UserDocument } from './user.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    // Mongoose User model (registered in app.module.ts)
    @InjectModel('User')
    private readonly userModel: Model<UserDocument>,

    // nestjs-boot's JWT service (auto-provided when auth.jwt is configured)
    // Methods: .sign(payload), .verify(token), .signRefresh(payload), .verifyRefresh(token)
    private readonly jwt: BootJwtService,
  ) {}

  // --------------------------------------------------------
  // REGISTER -- Create a new user account
  //
  // Steps:
  //   1. Check if email already exists (prevent duplicates)
  //   2. Hash the password (NEVER store plain text)
  //   3. Save user to database
  //   4. Return user info (WITHOUT the password hash!)
  // --------------------------------------------------------
  async register(email: string, password: string, name: string) {
    // Check for existing user
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) {
      // ConflictException = HTTP 409
      throw new ConflictException('Email already registered');
    }

    // Hash password with bcrypt (10 salt rounds)
    // SECURITY: bcrypt is intentionally slow -- it makes brute-force
    // attacks take years instead of seconds.
    const passwordHash = await bcrypt.hash(password, 10);

    // Save to database
    const user = await this.userModel.create({
      email,
      passwordHash,
      name,
      roles: ['user'],  // default role
    });

    this.logger.log(`User registered: ${user._id} ${email}`);

    // Return user info WITHOUT the password hash
    // SECURITY: Never include sensitive fields in API responses
    return {
      id: user._id!.toString(),
      email: user.email,
      name: user.name,
      roles: user.roles,
    };
  }

  // --------------------------------------------------------
  // LOGIN -- Verify credentials and return JWT tokens
  //
  // Steps:
  //   1. Find user by email
  //   2. Compare provided password with stored hash
  //   3. Sign JWT access token (short-lived, 15 min)
  //   4. Sign JWT refresh token (long-lived, 7 days)
  //   5. Store refresh token in database (for revocation)
  //   6. Return both tokens + user info
  // --------------------------------------------------------
  async login(email: string, password: string) {
    // Find user
    const user = await this.userModel.findOne({ email }).exec();
    if (!user) {
      // SECURITY: Don't reveal whether the email exists or not.
      // Always say "Invalid credentials" for both wrong email and wrong password.
      throw new UnauthorizedException('Invalid credentials');
    }

    // Compare password with hash
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // JWT payload -- this data is readable by anyone who has the token.
    // NEVER put sensitive data (passwords, SSN, etc.) in the payload.
    const payload = {
      sub: user._id!.toString(),  // 'sub' = subject (standard JWT claim for user ID)
      email: user.email,
      roles: user.roles,
    };

    // Sign tokens using nestjs-boot's BootJwtService
    const accessToken = this.jwt.sign(payload);        // expires in 15 min (from config)
    const refreshToken = this.jwt.signRefresh({        // expires in 7 days (from config)
      sub: user._id!.toString(),
    });

    // Store refresh token in DB (so we can revoke it later)
    user.refreshToken = refreshToken;
    await user.save();

    this.logger.log(`User logged in: ${user._id} ${email}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id!.toString(),
        email: user.email,
        name: user.name,
        roles: user.roles,
      },
    };
  }

  // --------------------------------------------------------
  // REFRESH -- Exchange a refresh token for new tokens
  //
  // WHY: Access tokens expire every 15 min. Instead of asking
  // the user to log in again, the client silently uses the
  // refresh token to get a new access token.
  //
  // SECURITY: We verify the refresh token AND check it matches
  // the one stored in the database. This prevents reuse of
  // old refresh tokens (token rotation).
  // --------------------------------------------------------
  async refreshToken(refreshToken: string) {
    try {
      // Verify the refresh token's signature + expiration
      const decoded = this.jwt.verifyRefresh(refreshToken);
      const userId = decoded.sub as string;

      // Check the token matches what's in the database
      const user = await this.userModel.findById(userId).exec();
      if (!user || user.refreshToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Issue new token pair (rotate refresh token for security)
      const payload = {
        sub: user._id!.toString(),
        email: user.email,
        roles: user.roles,
      };
      const newAccessToken = this.jwt.sign(payload);
      const newRefreshToken = this.jwt.signRefresh({ sub: user._id!.toString() });

      // Update stored refresh token
      user.refreshToken = newRefreshToken;
      await user.save();

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user._id!.toString(),
          email: user.email,
          name: user.name,
          roles: user.roles,
        },
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}

// ============================================================
// WHAT'S HAPPENING UNDER THE HOOD:
//
// BootJwtService wraps the 'jsonwebtoken' npm package:
//   .sign(payload)     -> jwt.sign(payload, secret, { expiresIn: '15m' })
//   .verify(token)     -> jwt.verify(token, secret)
//   .signRefresh(payload) -> jwt.sign(payload, refreshSecret, { expiresIn: '7d' })
//   .verifyRefresh(token) -> jwt.verify(token, refreshSecret)
//
// The secrets come from your BootOptions in main.ts:
//   auth.jwt.secret         -> for access tokens
//   auth.jwt.refreshSecret  -> for refresh tokens
//
// NEVER use the same secret for both! If the access token secret
// leaks, refresh tokens remain secure (and vice versa).
//
// Next lesson: Open src/auth/user.schema.ts
// ============================================================
