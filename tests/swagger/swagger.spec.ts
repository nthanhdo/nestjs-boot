import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupSwagger } from '../../src/swagger/swagger.setup';
import { SwaggerModule, SWAGGER_OPTIONS } from '../../src/swagger/swagger.module';

// ── Mock @nestjs/swagger factory ─────────────────────────────────────────────

function makeSwaggerMock() {
  const setupSpy = vi.fn();
  const createDocumentSpy = vi.fn().mockReturnValue({ openapi: '3.0.0' });

  const builderInstance = {
    setTitle: vi.fn().mockReturnThis(),
    setVersion: vi.fn().mockReturnThis(),
    setDescription: vi.fn().mockReturnThis(),
    addServer: vi.fn().mockReturnThis(),
    addTag: vi.fn().mockReturnThis(),
    addBearerAuth: vi.fn().mockReturnThis(),
    addApiKey: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue({ info: {} }),
  };

  return {
    DocumentBuilder: vi.fn(() => builderInstance),
    SwaggerModule: { createDocument: createDocumentSpy, setup: setupSpy },
    // exposed for assertions
    setupSpy,
    builderInstance,
  };
}

// ── setupSwagger() tests ──────────────────────────────────────────────────────

describe('setupSwagger()', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('sets up Swagger UI in development environment', () => {
    process.env.NODE_ENV = 'development';
    const mock = makeSwaggerMock();

    setupSwagger(
      {} as any,
      { path: '/api/docs', title: 'Test API', version: '2.0.0' },
      false,
      mock,
    );

    expect(mock.builderInstance.setTitle).toHaveBeenCalledWith('Test API');
    expect(mock.builderInstance.setVersion).toHaveBeenCalledWith('2.0.0');
    expect(mock.setupSpy).toHaveBeenCalledWith(
      '/api/docs',
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ jsonDocumentUrl: '/api/docs-json' }),
    );
  });

  it('does not call SwaggerModule.setup() in production when enabled is not set', () => {
    process.env.NODE_ENV = 'production';
    const mock = makeSwaggerMock();

    // enabled defaults to false in production
    setupSwagger({} as any, {}, false, mock);

    expect(mock.setupSpy).not.toHaveBeenCalled();
  });

  it('adds Bearer + ApiKey auth schemes when hasAuth=true', () => {
    process.env.NODE_ENV = 'development';
    const mock = makeSwaggerMock();

    setupSwagger({} as any, {}, true /* hasAuth */, mock);

    expect(mock.builderInstance.addBearerAuth).toHaveBeenCalled();
    expect(mock.builderInstance.addApiKey).toHaveBeenCalled();
  });

  it('mounts Swagger on custom path and exposes JSON spec at {path}-json', () => {
    process.env.NODE_ENV = 'development';
    const mock = makeSwaggerMock();

    setupSwagger({} as any, { path: '/docs/v2', enabled: true }, false, mock);

    expect(mock.setupSpy).toHaveBeenCalledWith(
      '/docs/v2',
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ jsonDocumentUrl: '/docs/v2-json' }),
    );
  });
});

// ── SwaggerModule.register() tests ───────────────────────────────────────────

describe('SwaggerModule.register()', () => {
  it('stores SwaggerOptions as a provider and exports SWAGGER_OPTIONS', () => {
    const opts = { path: '/api/docs', title: 'My Service', version: '3.0.0' };
    const dynamicModule = SwaggerModule.register(opts);

    expect(dynamicModule.module).toBe(SwaggerModule);

    const providers = dynamicModule.providers as any[];
    const optProvider = providers.find((p) => p.provide === SWAGGER_OPTIONS);
    expect(optProvider).toBeDefined();
    expect(optProvider.useValue).toEqual(opts);
    expect(dynamicModule.exports).toContain(SWAGGER_OPTIONS);
  });

  it('works with empty options (all defaults)', () => {
    const dynamicModule = SwaggerModule.register();

    const providers = dynamicModule.providers as any[];
    const optProvider = providers.find((p) => p.provide === SWAGGER_OPTIONS);
    expect(optProvider?.useValue).toEqual({});
  });
});
