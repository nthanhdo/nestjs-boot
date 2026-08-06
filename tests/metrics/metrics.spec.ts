import { describe, it, expect, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import request from 'supertest';
import { MetricsModule, MetricsService, HttpMetricsInterceptor } from '../../src/metrics';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Controller('test')
class TestController {
  @Get()
  hello() {
    return { message: 'ok' };
  }
}

@Module({
  controllers: [TestController],
})
class TestAppModule {}

describe('MetricsModule', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  async function createTestApp(options?: Parameters<typeof MetricsModule.register>[0], withInterceptor = false) {
    const providers: any[] = [];
    if (withInterceptor) {
      providers.push({
        provide: APP_INTERCEPTOR,
        useFactory: (svc: MetricsService) => new HttpMetricsInterceptor(svc),
        inject: [MetricsService],
      });
    }

    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule.register(options), TestAppModule],
      providers,
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  it('exposes /metrics endpoint with prometheus format', async () => {
    await createTestApp({ path: '/metrics', defaultMetrics: false });

    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('MetricsService creates and retrieves counters', async () => {
    await createTestApp({ defaultMetrics: false });

    const svc = app.get(MetricsService);
    const counter = svc.counter('test_counter', 'A test counter', ['label1']);
    counter.inc({ label1: 'a' });
    counter.inc({ label1: 'a' });

    const registry = svc.getRegistry()!;
    const metrics = await registry.metrics();
    expect(metrics).toContain('test_counter');
  });

  it('MetricsService creates histograms with custom buckets', async () => {
    await createTestApp({ defaultMetrics: false, prefix: 'app_' });

    const svc = app.get(MetricsService);
    const hist = svc.histogram('request_duration', 'Duration', [0.1, 0.5, 1]);
    hist.observe(0.25);

    const registry = svc.getRegistry()!;
    const metrics = await registry.metrics();
    expect(metrics).toContain('app_request_duration');
  });

  it('MetricsService creates gauges', async () => {
    await createTestApp({ defaultMetrics: false });

    const svc = app.get(MetricsService);
    const gauge = svc.gauge('active_connections', 'Active connections');
    gauge.set(42);

    const registry = svc.getRegistry()!;
    const metrics = await registry.metrics();
    expect(metrics).toContain('active_connections');
    expect(metrics).toContain('42');
  });

  it('returns same metric instance on duplicate name', async () => {
    await createTestApp({ defaultMetrics: false });

    const svc = app.get(MetricsService);
    const c1 = svc.counter('dup_counter', 'First');
    const c2 = svc.counter('dup_counter', 'Second');
    expect(c1).toBe(c2);
  });

  it('HttpMetricsInterceptor records request metrics', async () => {
    await createTestApp({ defaultMetrics: false }, true);

    // Make a request to generate metrics
    await request(app.getHttpServer()).get('/test').expect(200);

    const svc = app.get(MetricsService);
    const registry = svc.getRegistry()!;
    const metrics = await registry.metrics();
    expect(metrics).toContain('http_requests_total');
    expect(metrics).toContain('http_request_duration_seconds');
  });

  it('works when disabled (no /metrics endpoint)', async () => {
    await createTestApp({ enabled: false });

    // MetricsService should still be injectable
    const svc = app.get(MetricsService);
    expect(svc).toBeDefined();

    // counter should be no-op safe
    const counter = svc.counter('noop_counter', 'noop');
    expect(() => counter.inc()).not.toThrow();
  });
});
