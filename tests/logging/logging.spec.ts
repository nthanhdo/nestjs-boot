import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LoggingModule, BootLogger, LoggingInterceptor } from '../../src/logging';
import { CorrelationModule, getCorrelationId } from '../../src/correlation';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Controller('test')
class TestController {
  @Get()
  hello() {
    return { correlationId: getCorrelationId(), message: 'ok' };
  }
}

describe('LoggingModule', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  async function createTestApp(options?: Parameters<typeof LoggingModule.register>[0]) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        CorrelationModule.register(),
        LoggingModule.register(options),
      ],
      controllers: [TestController],
      providers: [
        {
          provide: APP_INTERCEPTOR,
          useExisting: LoggingInterceptor,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  it('BootLogger is injectable and implements LoggerService', async () => {
    await createTestApp();

    const logger = app.get(BootLogger);
    expect(logger).toBeDefined();
    expect(typeof logger.log).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.verbose).toBe('function');
    expect(typeof logger.fatal).toBe('function');
  });

  it('BootLogger logs without throwing', async () => {
    await createTestApp({ level: 'trace' });

    const logger = app.get(BootLogger);
    expect(() => logger.log('test message', 'TestContext')).not.toThrow();
    expect(() => logger.error('error msg', 'stack', 'TestContext')).not.toThrow();
    expect(() => logger.warn('warn msg')).not.toThrow();
    expect(() => logger.debug('debug msg')).not.toThrow();
    expect(() => logger.verbose('verbose msg')).not.toThrow();
    expect(() => logger.fatal('fatal msg')).not.toThrow();
  });

  it('LoggingInterceptor logs requests end-to-end', async () => {
    await createTestApp();

    const res = await request(app.getHttpServer())
      .get('/test')
      .set('X-Correlation-Id', 'test-corr-123')
      .expect(200);

    expect(res.body.message).toBe('ok');
    expect(res.body.correlationId).toBe('test-corr-123');
  });

  it('BootLogger has pino instance when pino is installed', async () => {
    await createTestApp();

    const logger = app.get(BootLogger);
    const pinoInstance = logger.getPinoInstance();
    // pino is installed in devDependencies, so should be available
    expect(pinoInstance).toBeDefined();
  });

  it('respects log level configuration', async () => {
    await createTestApp({ level: 'warn' });

    const logger = app.get(BootLogger);
    const pinoInstance = logger.getPinoInstance();
    expect(pinoInstance).toBeDefined();
    expect(pinoInstance.level).toBe('warn');
  });

  it('supports redact option', async () => {
    await createTestApp({ redact: ['req.headers.authorization'] });

    const logger = app.get(BootLogger);
    expect(logger).toBeDefined();
    // Just verify it doesn't throw during construction
    expect(() => logger.log('test with redact')).not.toThrow();
  });
});
