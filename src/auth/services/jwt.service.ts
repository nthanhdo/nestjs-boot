import { Injectable, Inject } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AUTH_OPTIONS } from '../constants';
import { AuthOptions } from '../interfaces';

/**
 * BootJwtService — pure JWT utility. No user model, no sessions, no database.
 * Signs and verifies tokens using the configured secret(s).
 */
@Injectable()
export class BootJwtService {
  private readonly secret: string;
  private readonly signOpts: jwt.SignOptions;
  private readonly refreshSecret: string;
  private readonly refreshSignOpts: jwt.SignOptions;

  constructor(@Inject(AUTH_OPTIONS) authOptions: AuthOptions) {
    const jwtOpts = authOptions.jwt!;
    this.secret = jwtOpts.secret;
    this.signOpts = {};
    if (jwtOpts.signOptions?.expiresIn) {
      this.signOpts.expiresIn = jwtOpts.signOptions.expiresIn as jwt.SignOptions['expiresIn'];
    }
    if (jwtOpts.signOptions?.algorithm) {
      this.signOpts.algorithm = jwtOpts.signOptions.algorithm as jwt.Algorithm;
    }

    this.refreshSecret = jwtOpts.refreshSecret ?? jwtOpts.secret;
    this.refreshSignOpts = {};
    if (jwtOpts.refreshExpiresIn) {
      this.refreshSignOpts.expiresIn = jwtOpts.refreshExpiresIn as jwt.SignOptions['expiresIn'];
    }
  }

  /** Sign an access token with arbitrary payload. */
  sign(payload: Record<string, any>): string {
    return jwt.sign(payload, this.secret, this.signOpts);
  }

  /** Verify and decode an access token. Throws on invalid/expired. */
  verify<T = Record<string, any>>(token: string): T {
    return jwt.verify(token, this.secret) as T;
  }

  /** Sign a refresh token (uses refreshSecret if configured, else main secret). */
  signRefresh(payload: Record<string, any>): string {
    return jwt.sign(payload, this.refreshSecret, this.refreshSignOpts);
  }

  /** Verify a refresh token. Throws on invalid/expired. */
  verifyRefresh<T = Record<string, any>>(token: string): T {
    return jwt.verify(token, this.refreshSecret) as T;
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
}
