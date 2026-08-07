import { HttpStatus } from '@nestjs/common';
import { transformMongooseError } from '../../src/common/mongoose-error.transformer';
import { ErrorCodes } from '../../src/common/error-codes';
import { BootException } from '../../src/common/boot-exception';

// ── Minimal Mongoose error stubs ────────────────────────────────────────────

function makeValidationError(fields: Record<string, { message: string; path: string; value: unknown; kind: string }>) {
  const err = new Error('Validation failed') as Error & {
    name: 'ValidationError';
    errors: typeof fields;
  };
  err.name = 'ValidationError';
  err.errors = fields;
  return err;
}

function makeDuplicateKeyError(keyValue: Record<string, unknown>) {
  const err = new Error('E11000 duplicate key') as Error & {
    name: 'MongoServerError';
    code: number;
    keyValue: typeof keyValue;
  };
  err.name = 'MongoServerError';
  err.code = 11000;
  err.keyValue = keyValue;
  return err;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('transformMongooseError', () => {
  it('transforms ValidationError to BootException with field-level details', () => {
    const mongoErr = makeValidationError({
      email: { message: 'email is required', path: 'email', value: undefined, kind: 'required' },
      age: { message: 'age must be positive', path: 'age', value: -1, kind: 'min' },
    });

    const result = transformMongooseError(mongoErr);

    expect(result).toBeInstanceOf(BootException);
    expect(result!.code).toBe(ErrorCodes.DB_VALIDATION_FAILED);
    expect(result!.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    const details = result!.details as Array<{ field: string; message: string }>;
    expect(details).toHaveLength(2);
    expect(details.map((d) => d.field)).toEqual(expect.arrayContaining(['email', 'age']));
  });

  it('transforms MongoServerError 11000 to BootException with duplicate field', () => {
    const mongoErr = makeDuplicateKeyError({ email: 'test@example.com' });

    const result = transformMongooseError(mongoErr);

    expect(result).toBeInstanceOf(BootException);
    expect(result!.code).toBe(ErrorCodes.DB_DUPLICATE_KEY);
    expect(result!.getStatus()).toBe(HttpStatus.CONFLICT);
    const details = result!.details as Array<{ field: string; value: unknown }>;
    expect(details[0].field).toBe('email');
    expect(details[0].value).toBe('test@example.com');
  });

  it('returns null for unrecognized errors (non-Mongoose)', () => {
    const plain = new Error('Some random error');
    expect(transformMongooseError(plain)).toBeNull();

    expect(transformMongooseError('string error')).toBeNull();
    expect(transformMongooseError(null)).toBeNull();
  });
});
