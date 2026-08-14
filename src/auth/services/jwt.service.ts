import { Injectable, Inject } from '@nestjs/common';
import type * as jwtTypes from 'jsonwebtoken';
import { AUTH_OPTIONS } from '../constants';
import { AuthOptions } from '../interfaces';

// Lazy-load jsonwebtoken to avoid hard dependency at import time
let _jwt: typeof import('jsonwebtoken') | undefined;
function getJwt(): typeof import('jsonwebtoken') {
  if (!_jwt) {
    try {
      _jwt = require('jsonwebtoken');
    } catch {
      throw new Error(
        'jsonwebtoken is required by BootJwtService. Install it: npm i jsonwebtoken',
      );
    }
  }
  return _jwt!;
}

/**
 * BootJwtService — pure JWT utility. No user model, no sessions, no database.
 * Signs and verifies tokens using the configured secret(s).
 */
@Injectable()
export class BootJwtService {
  private readonly secret: string;
  private readonly signOpts: jwtTypes.SignOptions;
  private readonly algorithm: jwtTypes.Algorithm;
  private readonly refreshSecret: string;
  private readonly refreshSignOpts: jwtTypes.SignOptions;
  /** Separate secret for password-reset and email-verification tokens. */
  private readonly resetSecret: string;

  constructor(@Inject(AUTH_OPTIONS) authOptions: AuthOptions) {
    const jwtOpts = authOptions.jwt!;
    this.secret = jwtOpts.secret;
    this.signOpts = {};
    if (jwtOpts.signOptions?.expiresIn) {
      this.signOpts.expiresIn = jwtOpts.signOptions.expiresIn as jwtTypes.SignOptions['expiresIn'];
    }
    this.algorithm = (jwtOpts.signOptions?.algorithm as jwtTypes.Algorithm) ?? 'HS256';
    if (jwtOpts.signOptions?.algorithm) {
      this.signOpts.algorithm = jwtOpts.signOptions.algorithm as jwtTypes.Algorithm;
    }

    this.refreshSecret = jwtOpts.refreshSecret ?? jwtOpts.secret;
    this.resetSecret = jwtOpts.resetSecret ?? jwtOpts.secret;
    this.refreshSignOpts = {};
    if (jwtOpts.refreshExpiresIn) {
      this.refreshSignOpts.expiresIn = jwtOpts.refreshExpiresIn as jwtTypes.SignOptions['expiresIn'];
    }
  }

  /** Sign an access token with arbitrary payload. */
  sign(payload: Record<string, any>): string {
    return getJwt().sign(payload, this.secret, this.signOpts);
  }

  /** Verify and decode an access token. Throws on invalid/expired. */
  verify<T = Record<string, any>>(token: string): T {
    return getJwt().verify(token, this.secret, { algorithms: [this.algorithm] }) as T;
  }

  /** Sign a refresh token (uses refreshSecret if configured, else main secret). */
  signRefresh(payload: Record<string, any>): string {
    return getJwt().sign(payload, this.refreshSecret, this.refreshSignOpts);
  }

  /** Verify a refresh token. Throws on invalid/expired. */
  verifyRefresh<T = Record<string, any>>(token: string): T {
    return getJwt().verify(token, this.refreshSecret, { algorithms: [this.algorithm] }) as T;
  }

  /**
   * Rotate a refresh token: verify the old one, issue a new access + refresh pair.
   * The old refresh token's payload (minus iat/exp/nbf) is re-signed.
   * Throws if oldToken is invalid/expired.
   */
  rotateRefreshToken(oldToken: string): { accessToken: string; refreshToken: string } {
    const decoded = this.verifyRefresh(oldToken);
    // Strip JWT-specific claims to get clean payload
    const { iat, exp, nbf, jti, ...payload } = decoded as Record<string, any>;
    return {
      accessToken: this.sign(payload),
      refreshToken: this.signRefresh(payload),
    };
  }

  /**
   * Sign a password reset token. Short-lived (default 15m).
   * Includes a purpose claim to prevent misuse as an access token.
   * Uses resetSecret (isolated from access/refresh tokens).
   */
  signPasswordReset(userId: string, options?: { expiresIn?: string }): string {
    const jwt = getJwt();
    const signOpts: jwtTypes.SignOptions = {
      expiresIn: (options?.expiresIn ?? '15m') as jwtTypes.SignOptions['expiresIn'],
    };
    return jwt.sign(
      { sub: userId, purpose: 'password-reset' },
      this.resetSecret,
      signOpts,
    );
  }

  /**
   * Verify a password reset token. Checks purpose claim.
   * Throws if invalid, expired, or wrong purpose.
   */
  verifyPasswordReset(token: string): { sub: string; purpose: string } {
    const decoded = getJwt().verify(token, this.resetSecret, { algorithms: [this.algorithm] }) as Record<string, any>;
    if (decoded.purpose !== 'password-reset') {
      throw new Error('Invalid token purpose: expected password-reset');
    }
    return { sub: decoded.sub, purpose: decoded.purpose };
  }

  /**
   * Sign an email verification token with the email embedded.
   * Default expiry: 24h. Uses resetSecret (isolated from access/refresh tokens).
   */
  signEmailVerification(email: string, options?: { expiresIn?: string }): string {
    const jwt = getJwt();
    const signOpts: jwtTypes.SignOptions = {
      expiresIn: (options?.expiresIn ?? '24h') as jwtTypes.SignOptions['expiresIn'],
    };
    return jwt.sign(
      { email, purpose: 'email-verification' },
      this.resetSecret,
      signOpts,
    );
  }

  /**
   * Verify an email verification token. Checks purpose claim.
   * Returns the email. Throws if invalid, expired, or wrong purpose.
   */
  verifyEmailVerification(token: string): { email: string; purpose: string } {
    const decoded = getJwt().verify(token, this.resetSecret, { algorithms: [this.algorithm] }) as Record<string, any>;
    if (decoded.purpose !== 'email-verification') {
      throw new Error('Invalid token purpose: expected email-verification');
    }
    return { email: decoded.email, purpose: decoded.purpose };
  }
}
