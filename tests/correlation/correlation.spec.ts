import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import request from 'supertest';
import {
  CorrelationModule,
  getCorrelationId,
  runWithCorrelationId,
  setCorrelationId,
} from '../../src/correlation';

// --- Test controller that exposes correlation ID ---
@Controller('test')
class TestController {
  @Get()
  getCorrelation() {
    return { correlationId: getCorrelationId() };
  }

  @Get('nested')
  getNested() {
    // Simulate nested async work
    const outer = getCorrelationId();
    let inner: string | undefined;
    runWithCorrelationId('nested-id', () => {
      inner = getCorrelationId();
    });
    // After runWithCorrelationId, should be back to outer
    const afterNested = getCorrelationId();
    return { outer, inner, afterNested };
  }
}

@Module({
  controllers: [TestController],
})
class TestAppModule {}

describe('CorrelationIdMiddleware', () => {
  let app: INestApplication;

  async function createTestApp(options?: { header?: string; generator?: () => string }) {
    const moduleRef = await Test.createTestingModule({
      imports: [CorrelationModule.register(options), TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  afterEach(async () => {
    if (app) await app.close();
  });

  it('generates correlation ID when not present in request', async () => {
    await createTestApp();

    const res = await request(app.getHttpServer()).get('/test').expect(200);

    // Response should have X-Correlation-Id header
    expect(res.headers['x-correlation-id']).toBeDefined();
    expect(res.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    // Body should have the same correlation ID
    expect(res.body.correlationId).toBe(res.headers['x-correlation-id']);
  });

  it('uses existing correlation ID from request header', async () => {
    await createTestApp();
    const existingId = 'my-custom-correlation-id-123';

    const res = await request(app.getHttpServer())
      .get('/test')
      .set('X-Correlation-Id', existingId)
      .expect(200);

    expect(res.headers['x-correlation-id']).toBe(existingId);
    expect(res.body.correlationId).toBe(existingId);
  });

  it('sets correlation ID on response header', async () => {
    await createTestApp();

    const res = await request(app.getHttpServer()).get('/test').expect(200);

    const header = res.headers['x-correlation-id'];
    expect(header).toBeDefined();
    expect(typeof header).toBe('string');
    expect(header.length).toBeGreaterThan(0);
  });

  it('AsyncLocalStorage getCorrelationId works in nested calls', async () => {
    await createTestApp();

    const res = await request(app.getHttpServer())
      .get('/test/nested')
      .set('X-Correlation-Id', 'outer-id')
      .expect(200);

    expect(res.body.outer).toBe('outer-id');
    expect(res.body.inner).toBe('nested-id');
    // After nested run completes, context should be back to outer
    expect(res.body.afterNested).toBe('outer-id');
  });

  it('supports custom header name', async () => {
    await createTestApp({ header: 'X-Request-Id' });

    const res = await request(app.getHttpServer())
      .get('/test')
      .set('X-Request-Id', 'custom-header-id')
      .expect(200);

    expect(res.headers['x-request-id']).toBe('custom-header-id');
    expect(res.body.correlationId).toBe('custom-header-id');
  });

  it('supports custom generator function', async () => {
    let counter = 0;
    await createTestApp({ generator: () => `custom-${++counter}` });

    const res = await request(app.getHttpServer()).get('/test').expect(200);

    expect(res.headers['x-correlation-id']).toBe('custom-1');
    expect(res.body.correlationId).toBe('custom-1');
  });
});

describe('W3C traceparent propagation', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('stores traceparent from incoming request header in ALS', async () => {
    // Create a controller that reads traceparent from storage
    const { getTraceparent } = await import('../../src/correlation/correlation.storage');

    @Controller('trace')
    class TraceController {
      @Get()
      getTrace() {
        return { traceparent: getTraceparent() };
      }
    }

    @Module({ controllers: [TraceController] })
    class TraceAppModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [CorrelationModule.register(), TraceAppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const res = await request(app.getHttpServer())
      .get('/trace')
      .set('traceparent', tp)
      .expect(200);

    expect(res.body.traceparent).toBe(tp);
  });
});

describe('correlationStorage standalone', () => {
  it('getCorrelationId returns undefined outside context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it('setCorrelationId updates current store', () => {
    runWithCorrelationId('initial', () => {
      expect(getCorrelationId()).toBe('initial');
      setCorrelationId('updated');
      expect(getCorrelationId()).toBe('updated');
    });
  });

  it('runWithCorrelationId isolates contexts', () => {
    runWithCorrelationId('outer', () => {
      expect(getCorrelationId()).toBe('outer');
      runWithCorrelationId('inner', () => {
        expect(getCorrelationId()).toBe('inner');
      });
      expect(getCorrelationId()).toBe('outer');
    });
  });
});
