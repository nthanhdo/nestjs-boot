import { describe, it, expect } from 'vitest';
import { Module } from '@nestjs/common';
import { BootOptions } from '../src/interfaces/boot-options.interface';

// We test createApp validation logic directly since full app creation
// would require a real MongoDB connection.
import { validateBootOptions } from '../src/config/validators';

@Module({})
class TestAppModule {}

describe('createApp', () => {
  it('validates minimal config (empty object) successfully', () => {
    const options: BootOptions = {};
    const validated = validateBootOptions(options);

    expect(validated).toBeDefined();
    expect(validated.database).toBeUndefined();
    expect(validated.cache).toBeUndefined();
    // envelope defaults to false (opt-in)
    expect((validated as any).response.envelope).toBe(false);
    // errorHandler defaults to true
    expect((validated as any).response.errorHandler).toBe(true);
    // health defaults to enabled
    expect((validated as any).health.enabled).toBe(true);
  });

  it('throws validation error for invalid config', () => {
    const badOptions = {
      database: {
        connections: {
          master: { writerUri: 'not-a-uri' },
        },
      },
    };

    expect(() => validateBootOptions(badOptions)).toThrow(
      '[nestjs-boot] Invalid configuration',
    );
  });
});
