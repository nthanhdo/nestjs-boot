import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * TotpService — TOTP / 2FA utilities.
 *
 * NO storage — caller stores the secret in their user model.
 * Uses `otpauth` library if available, falls back to built-in HMAC-based TOTP.
 */
@Injectable()
export class TotpService {
  private otpauthLib: any;

  constructor() {
    try {
      this.otpauthLib = require('otpauth');
    } catch {
      this.otpauthLib = null;
    }
  }

  /**
   * Generate a new TOTP secret + otpauth URL.
   * @param label — user identifier (email, username)
   * @param issuer — app name
   */
  generateSecret(label: string, issuer = 'NestJS-Boot'): {
    secret: string;
    otpauthUrl: string;
    qrDataUrl: string;
  } {
    if (this.otpauthLib) {
      const { TOTP, Secret } = this.otpauthLib;
      const secret = new Secret();
      const totp = new TOTP({
        issuer,
        label,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret,
      });
      const otpauthUrl = totp.toString();
      return {
        secret: secret.base32,
        otpauthUrl,
        qrDataUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`,
      };
    }

    // Fallback: generate secret manually
    const secretBytes = crypto.randomBytes(20);
    const base32Secret = this.base32Encode(secretBytes);
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${base32Secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

    return {
      secret: base32Secret,
      otpauthUrl,
      qrDataUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`,
    };
  }

  /**
   * Verify a TOTP token against a secret.
   * Allows ±1 time window for clock drift.
   */
  verify(token: string, secret: string): boolean {
    if (this.otpauthLib) {
      const { TOTP, Secret } = this.otpauthLib;
      const totp = new TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secret),
      });
      // delta=null means invalid, otherwise it's the time step difference
      const delta = totp.validate({ token, window: 1 });
      return delta !== null;
    }

    // Fallback: manual TOTP verification
    const now = Math.floor(Date.now() / 1000);
    const period = 30;

    for (let i = -1; i <= 1; i++) {
      const timeStep = Math.floor(now / period) + i;
      const expected = this.generateTOTP(secret, timeStep);
      if (expected === token) return true;
    }
    return false;
  }

  /**
   * Generate backup codes (one-time use, caller stores + tracks usage).
   */
  generateBackupCodes(count = 8): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      // Format: XXXX-XXXX
      codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
    }
    return codes;
  }

  private generateTOTP(base32Secret: string, timeStep: number): string {
    const secretBytes = this.base32Decode(base32Secret);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigUInt64BE(BigInt(timeStep));

    const hmac = crypto.createHmac('sha1', secretBytes);
    hmac.update(timeBuffer);
    const hash = hmac.digest();

    const offset = hash[hash.length - 1] & 0x0f;
    const code =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    return String(code % 1000000).padStart(6, '0');
  }

  private base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let bits = 0;
    let value = 0;
    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        result += alphabet[(value >>> (bits - 5)) & 0x1f];
        bits -= 5;
      }
    }
    if (bits > 0) {
      result += alphabet[(value << (5 - bits)) & 0x1f];
    }
    return result;
  }

  private base32Decode(input: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    const output: number[] = [];
    for (const char of input.toUpperCase()) {
      const idx = alphabet.indexOf(char);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(output);
  }
}
