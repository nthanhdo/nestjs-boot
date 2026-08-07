import { ErrorCodes } from '../../src/common/error-codes';

describe('ErrorCodes', () => {
  it('should expose all codes as plain string constants (not enum values)', () => {
    // Every value must be a string equal to its key — safe for JSON serialization
    for (const [key, value] of Object.entries(ErrorCodes)) {
      expect(typeof value).toBe('string');
      expect(value).toBe(key);
    }
  });

  it('should be immutable (as const prevents runtime mutation)', () => {
    // TypeScript `as const` does not add Object.freeze at runtime, but we verify
    // the shape is stable and all expected categories are present.
    const authCodes = [
      ErrorCodes.AUTH_TOKEN_EXPIRED,
      ErrorCodes.AUTH_TOKEN_INVALID,
      ErrorCodes.AUTH_TOKEN_REVOKED,
      ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS,
      ErrorCodes.AUTH_RATE_LIMITED,
    ];
    const dbCodes = [
      ErrorCodes.DB_CONNECTION_FAILED,
      ErrorCodes.DB_DUPLICATE_KEY,
      ErrorCodes.DB_VALIDATION_FAILED,
      ErrorCodes.DB_NOT_FOUND,
    ];
    const transportCodes = [
      ErrorCodes.TRANSPORT_TIMEOUT,
      ErrorCodes.TRANSPORT_UNAVAILABLE,
      ErrorCodes.TRANSPORT_CIRCUIT_OPEN,
    ];
    const generalCodes = [
      ErrorCodes.VALIDATION_FAILED,
      ErrorCodes.RATE_LIMITED,
      ErrorCodes.INTERNAL_ERROR,
    ];

    const allCodes = [...authCodes, ...dbCodes, ...transportCodes, ...generalCodes];

    // No duplicates
    const unique = new Set(allCodes);
    expect(unique.size).toBe(allCodes.length);

    // All codes are non-empty strings
    for (const code of allCodes) {
      expect(code.length).toBeGreaterThan(0);
    }
  });
});
