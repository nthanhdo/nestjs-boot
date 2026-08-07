import { describe, it, expect } from 'vitest';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BootConfigModule } from '../../src/config/config.module';
import { BootConfigService } from '../../src/config/config.service';

describe('BootConfigModule.registerAsync', () => {
  it('should load config from async factory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        BootConfigModule.registerAsync({
          useFactory: async () => ({
            health: { enabled: true, path: '/healthz' },
          }),
        }),
      ],
    }).compile();

    const config = moduleRef.get(BootConfigService);
    expect(config.get('health.path')).toBe('/healthz');
  });

  it('should validate config from async factory', async () => {
    await expect(
      Test.createTestingModule({
        imports: [
          BootConfigModule.registerAsync({
            useFactory: async () => ({
              database: {
                connections: {
                  master: { writerUri: 'not-a-valid-uri' },
                },
              },
            }),
          }),
        ],
      }).compile(),
    ).rejects.toThrow('Invalid configuration');
  });

  it('should inject dependencies into factory', async () => {
    const CONFIG_SOURCE = 'CONFIG_SOURCE';

    @Module({
      providers: [{ provide: CONFIG_SOURCE, useValue: { port: 4000 } }],
      exports: [CONFIG_SOURCE],
    })
    class SourceModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        SourceModule,
        BootConfigModule.registerAsync({
          imports: [SourceModule],
          inject: [CONFIG_SOURCE],
          useFactory: async (source: any) => ({
            health: { path: `/health-${source.port}` },
          }),
        }),
      ],
    }).compile();

    const config = moduleRef.get(BootConfigService);
    expect(config.get('health.path')).toBe('/health-4000');
  });
});

describe('BootConfigService.getSchema', () => {
  it('should return Joi schema description', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BootConfigModule.register({})],
    }).compile();

    const config = moduleRef.get(BootConfigService);
    const schema = config.getSchema();
    expect(schema).toBeDefined();
    expect(schema.type).toBe('object');
    expect((schema as any).keys).toBeDefined();
    expect((schema as any).keys.database).toBeDefined();
    expect((schema as any).keys.cache).toBeDefined();
  });
});
