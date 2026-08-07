/**
 * mongoose-error.transformer.ts — Mongoose error → BootException transformer.
 *
 * Catches the two most common Mongoose errors that every NestJS+Mongoose dev
 * hits and turns them into clean, structured BootExceptions with stable codes.
 *
 * Supported transformations:
 * - `ValidationError` → BootException(DB_VALIDATION_FAILED, 422) + field-level details
 * - `MongoServerError` 11000 (duplicate key) → BootException(DB_DUPLICATE_KEY, 409) + field name
 *
 * Usage A — per-service (recommended for targeted handling):
 * ```ts
 * import { transformMongooseError } from '@nestjs-boot/common';
 *
 * async create(dto: CreateUserDto) {
 *   try {
 *     return await this.userModel.create(dto);
 *   } catch (err) {
 *     throw transformMongooseError(err) ?? err;
 *   }
 * }
 * ```
 *
 * Usage B — global interceptor (catches everything automatically):
 * ```ts
 * // In AppModule providers:
 * { provide: APP_INTERCEPTOR, useClass: MongooseErrorInterceptor }
 * ```
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpStatus,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { BootException } from './boot-exception';
import { ErrorCodes } from './error-codes';

// ── Type helpers (no hard mongoose dependency at import time) ────────────────

interface MongooseValidationError extends Error {
  name: 'ValidationError';
  errors: Record<string, { message: string; path: string; value: unknown; kind: string }>;
}

interface MongoServerError extends Error {
  name: 'MongoServerError';
  code: number;
  keyValue?: Record<string, unknown>;
}

function isMongooseValidationError(err: unknown): err is MongooseValidationError {
  return (
    err instanceof Error &&
    err.name === 'ValidationError' &&
    'errors' in err &&
    typeof (err as Record<string, unknown>).errors === 'object'
  );
}

function isMongoServerError(err: unknown): err is MongoServerError {
  return (
    err instanceof Error &&
    err.name === 'MongoServerError' &&
    'code' in err
  );
}

// ── Core transformer ─────────────────────────────────────────────────────────

export interface ValidationFieldError {
  field: string;
  message: string;
  value?: unknown;
  kind?: string;
}

export interface DuplicateKeyDetail {
  field: string;
  value: unknown;
}

/**
 * Attempt to transform a Mongoose error into a BootException.
 *
 * Returns:
 * - `BootException` — when the error is a known Mongoose error type
 * - `null` — when the error is not recognized (caller should rethrow original)
 */
export function transformMongooseError(err: unknown): BootException | null {
  // ValidationError → 422 with per-field details
  if (isMongooseValidationError(err)) {
    const details: ValidationFieldError[] = Object.entries(err.errors).map(
      ([field, fieldErr]) => ({
        field,
        message: fieldErr.message,
        value: fieldErr.value,
        kind: fieldErr.kind,
      }),
    );

    return new BootException(
      `Validation failed: ${details.map((d) => d.field).join(', ')}`,
      {
        code: ErrorCodes.DB_VALIDATION_FAILED,
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        details,
      },
    );
  }

  // MongoServerError 11000 → 409 Conflict with duplicate field name
  if (isMongoServerError(err) && err.code === 11000) {
    const keyValue = err.keyValue ?? {};
    const fields = Object.keys(keyValue);
    const details: DuplicateKeyDetail[] = fields.map((field) => ({
      field,
      value: keyValue[field],
    }));

    const fieldList = fields.length > 0 ? fields.join(', ') : 'unknown field';

    return new BootException(
      `Duplicate key: ${fieldList} already exists`,
      {
        code: ErrorCodes.DB_DUPLICATE_KEY,
        status: HttpStatus.CONFLICT,
        details,
      },
    );
  }

  return null;
}

// ── Global NestJS interceptor ────────────────────────────────────────────────

/**
 * MongooseErrorInterceptor — register as APP_INTERCEPTOR to catch Mongoose
 * errors globally and transform them to structured BootExceptions.
 *
 * ```ts
 * // app.module.ts
 * providers: [
 *   { provide: APP_INTERCEPTOR, useClass: MongooseErrorInterceptor },
 * ]
 * ```
 */
@Injectable()
export class MongooseErrorInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        const transformed = transformMongooseError(err);
        return throwError(() => transformed ?? err);
      }),
    );
  }
}
