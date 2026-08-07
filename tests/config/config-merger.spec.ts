import { mergeConfigs } from '../../src/config/config-merger';
import { ConfigSource } from '../../src/config/adapters/config-source.interface';

function makeSource(name: string, data: Record<string, unknown>): ConfigSource {
  return {
    name,
    load: async () => data,
  };
}

describe('mergeConfigs', () => {
  it('returns empty object when no sources provided', async () => {
    const result = await mergeConfigs([]);
    expect(result).toEqual({});
  });

  it('merges multiple flat sources in order — later sources win', async () => {
    const result = await mergeConfigs([
      makeSource('base', { HOST: 'localhost', PORT: '3000', DEBUG: 'false' }),
      makeSource('override', { PORT: '8080', SECRET: 'abc123' }),
    ]);

    expect(result).toEqual({
      HOST: 'localhost',
      PORT: '8080',       // overridden by later source
      DEBUG: 'false',
      SECRET: 'abc123',  // added by later source
    });
  });

  it('deep-merges nested objects without clobbering sibling keys', async () => {
    const result = await mergeConfigs([
      makeSource('env-file', {
        database: { host: 'localhost', port: 27017, name: 'mydb' },
        cache: { ttl: 300 },
      }),
      makeSource('vault', {
        database: { password: 'secret', host: 'prod-db.internal' },
      }),
    ]);

    expect(result).toEqual({
      database: {
        host: 'prod-db.internal', // overridden
        port: 27017,               // preserved from base
        name: 'mydb',             // preserved from base
        password: 'secret',       // added by vault
      },
      cache: { ttl: 300 },        // untouched
    });
  });

  it('throws with source name when a source fails to load', async () => {
    const brokenSource: ConfigSource = {
      name: 'broken-vault',
      load: async () => { throw new Error('connection refused'); },
    };

    await expect(
      mergeConfigs([makeSource('base', { A: '1' }), brokenSource]),
    ).rejects.toThrow('ConfigSource "broken-vault" failed to load');
  });
});
