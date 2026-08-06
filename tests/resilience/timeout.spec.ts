import { describe, it, expect } from 'vitest';
import { Controller, Get } from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TimeoutInterceptor } from '../../src/resilience/timeout.interceptor';
import { Timeout } from '../../src/resilience/timeout.decorator';
import { RESILIENCE_OPTIONS } from '../../src/resilience/constants';
import type { ResilienceOptions } from '../../src/resilience/interfaces';

@Controller()
class TestController {
  @Get('/fast')
  async fast() {
    return { ok: true };
  }

  @Get('/slow')
  async slow() {
    await new Promise((r) => setTimeout(r, 500));
    return { ok: true };
  }

  @Timeout(50)
  @Get('/custom-timeout')
  async customTimeout() {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  @Timeout(2000)
  @Get('/generous-timeout')
  async generousTimeout() {
    await new Promise((r) => setTimeout(r, 100));
    return { ok: true };
  }
}

describe('TimeoutInterceptor', () => {
  async function createApp(defaultTimeout: number) {
    const module = await Test.createTestingModule({
      controllers: [TestController],
      providers: [
        {
          provide: APP_INTERCEPTOR,
          useFactory: (reflector: Reflector, opts: ResilienceOptions) =>
            new TimeoutInterceptor(reflector, opts),
          inject: [Reflector, RESILIENCE_OPTIONS],
        },
        {
          provide: RESILIENCE_OPTIONS,
          useValue: { timeout: { default: defaultTimeout } },
        },
      ],
    }).compile();

    const app = module.createNestApplication();
    await app.init();
    return app;
  }

  it('passes within timeout', async () => {
    const app = await createApp(1000);
    await request(app.getHttpServer()).get('/fast').expect(200);
    await app.close();
  });

  it('throws RequestTimeoutException on timeout', async () => {
    const app = await createApp(100); // 100ms default, /slow takes 500ms
    const res = await request(app.getHttpServer()).get('/slow');
    expect(res.status).toBe(408);
    await app.close();
  });

  it('per-route @Timeout overrides default', async () => {
    const app = await createApp(1000); // generous default
    // /custom-timeout has 50ms but handler takes 200ms → should timeout
    const res = await request(app.getHttpServer()).get('/custom-timeout');
    expect(res.status).toBe(408);

    // /generous-timeout has 2000ms and handler takes 100ms → should pass
    await request(app.getHttpServer()).get('/generous-timeout').expect(200);

    await app.close();
  });
});
