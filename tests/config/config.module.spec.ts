import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { BootConfigModule } from '../../src/config/config.module';
import { BootConfigService } from '../../src/config/config.service';
import { BOOT_OPTIONS } from '../../src/config/constants';
import { BootOptions } from '../../src/interfaces/boot-options.interface';

describe('BootConfigModule', () => {
  it('registers successfully with valid config', async () => {
    const options: BootOptions = {
      database: {
        connections: {
          master: { writerUri: 'mongodb://localhost:27017/test' },
        },
      },
    };

    const module = await Test.createTestingModule({
      imports: [BootConfigModule.register(options)],
    }).compile();

    const configService = module.get(BootConfigService);
    expect(configService).toBeDefined();
    expect(
      configService.get<string>('database.connections.master.writerUri'),
    ).toBe('mongodb://localhost:27017/test');

    const injectedOptions = module.get(BOOT_OPTIONS);
    expect(injectedOptions).toBeDefined();
    expect(injectedOptions.database.connections.master.writerUri).toBe(
      'mongodb://localhost:27017/test',
    );

    await module.close();
  });

  it('throws on invalid config — missing writerUri', () => {
    const badOptions = {
      database: {
        connections: {
          master: {}, // missing writerUri
        },
      },
    } as unknown as BootOptions;

    expect(() => BootConfigModule.register(badOptions)).toThrow(
      '[nestjs-boot] Invalid configuration',
    );
  });

  it('throws on invalid config — empty connections', () => {
    const badOptions = {
      database: {
        connections: {},
      },
    } as BootOptions;

    expect(() => BootConfigModule.register(badOptions)).toThrow(
      '[nestjs-boot] Invalid configuration',
    );
  });

  it('registers with minimal config (no database)', async () => {
    const options: BootOptions = {};

    const module = await Test.createTestingModule({
      imports: [BootConfigModule.register(options)],
    }).compile();

    const configService = module.get(BootConfigService);
    expect(configService).toBeDefined();
    expect(configService.get('database')).toBeUndefined();

    await module.close();
  });
});
