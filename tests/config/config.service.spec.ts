import { describe, it, expect } from 'vitest';
import { BootConfigService } from '../../src/config/config.service';
import { BootOptions } from '../../src/interfaces/boot-options.interface';

function createService(options: BootOptions): BootConfigService {
  return new (BootConfigService as any)(options) as BootConfigService;
}

// Manually inject since we're not using NestJS DI in unit tests
function makeService(options: BootOptions): BootConfigService {
  const service = Object.create(BootConfigService.prototype);
  (service as any).options = options;
  return service;
}

describe('BootConfigService', () => {
  const options: BootOptions = {
    database: {
      connections: {
        master: {
          writerUri: 'mongodb://localhost:27017/master',
          readerUri: 'mongodb://localhost:27018/master',
        },
      },
    },
    cache: {
      redis: { url: 'redis://localhost:6379' },
      defaultTtl: 600,
    },
  };

  const service = makeService(options);

  it('get() returns value at dot-notation path', () => {
    expect(service.get<string>('database.connections.master.writerUri')).toBe(
      'mongodb://localhost:27017/master',
    );
    expect(service.get<number>('cache.defaultTtl')).toBe(600);
  });

  it('get() returns undefined for missing path', () => {
    expect(service.get('database.connections.analytics')).toBeUndefined();
    expect(service.get('nonexistent.deep.path')).toBeUndefined();
  });

  it('getOrThrow() throws for missing path', () => {
    expect(() => service.getOrThrow('database.connections.analytics')).toThrow(
      '[nestjs-boot] Config path "database.connections.analytics" is not defined',
    );
  });

  it('getOrThrow() returns value for existing path', () => {
    expect(
      service.getOrThrow<string>('database.connections.master.writerUri'),
    ).toBe('mongodb://localhost:27017/master');
  });

  it('getAll() returns full options', () => {
    expect(service.getAll()).toEqual(options);
  });
});
