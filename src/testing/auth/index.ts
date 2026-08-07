import { DynamicModule, Module } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AUTH_OPTIONS } from '../../auth/constants';

/** Default test secret — NEVER use in production */
const TEST_SECRET = 'nestjs-boot-test-secret-do-not-use-in-prod';

export interface CreateTestJwtOptions {
  secret?: string;
  expiresIn?: string | number;
  algorithm?: jwt.Algorithm;
}

/**
 * Create a valid JWT for testing. Uses a default test secret.
 */
export function createTestJwt(
  payload: Record<string, any>,
  options?: CreateTestJwtOptions,
): string {
  const secret = options?.secret ?? TEST_SECRET;
  const signOpts: jwt.SignOptions = {};
  if (options?.expiresIn) signOpts.expiresIn = options.expiresIn as jwt.SignOptions['expiresIn'];
  if (options?.algorithm) signOpts.algorithm = options.algorithm;
  return jwt.sign(payload, secret, signOpts);
}

/**
 * Create a test API key string with optional permissions metadata.
 * Returns a deterministic key based on permissions for reproducible tests.
 */
export function createTestApiKey(permissions?: string[]): string {
  const suffix = permissions?.length
    ? Buffer.from(permissions.join(',')).toString('base64url').slice(0, 12)
    : 'default';
  return `test-api-key-${suffix}`;
}

/**
 * Create a mock request object with Bearer token set.
 * Useful for unit-testing guards and services.
 */
export function createAuthenticatedRequest(
  payload: Record<string, any>,
  options?: CreateTestJwtOptions,
): { headers: { authorization: string }; user?: Record<string, any> } {
  const token = createTestJwt(payload, options);
  return {
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
}

/**
 * MockAuthModule — bypasses all auth guards for e2e tests where auth isn't the focus.
 *
 * ```ts
 * const module = await Test.createTestingModule({
 *   imports: [MockAuthModule.register(), AppModule],
 * }).compile();
 * ```
 */
@Module({})
export class MockAuthModule {
  static register(mockUser?: Record<string, any>): DynamicModule {
    const defaultUser = mockUser ?? { sub: 'test-user-id', email: 'test@example.com' };
    return {
      module: MockAuthModule,
      global: true,
      providers: [
        {
          provide: AUTH_OPTIONS,
          useValue: {
            jwt: {
              secret: TEST_SECRET,
              signOptions: { expiresIn: '1h' },
            },
          },
        },
        {
          provide: 'MOCK_AUTH_USER',
          useValue: defaultUser,
        },
      ],
      exports: [AUTH_OPTIONS, 'MOCK_AUTH_USER'],
    };
  }
}

export { TEST_SECRET };
