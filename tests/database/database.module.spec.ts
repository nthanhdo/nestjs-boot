import { describe, it, expect } from 'vitest';
import { DatabaseModule } from '../../src/database/database.module';
import { getWriterToken, getReaderToken } from '../../src/database/constants';

describe('DatabaseModule', () => {
  it('registers with single connection', () => {
    const dynamicModule = DatabaseModule.register({
      connections: {
        master: { writerUri: 'mongodb://localhost:27017/test' },
      },
    });

    expect(dynamicModule.module).toBe(DatabaseModule);
    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.imports).toHaveLength(1); // 1 writer
    expect(dynamicModule.exports).toContain(getWriterToken('master'));
  });

  it('registers with multiple connections including reader', () => {
    const dynamicModule = DatabaseModule.register({
      connections: {
        master: {
          writerUri: 'mongodb://localhost:27017/master',
          readerUri: 'mongodb://localhost:27017/master-reader',
        },
        analytics: {
          writerUri: 'mongodb://localhost:27017/analytics',
        },
      },
    });

    expect(dynamicModule.imports).toHaveLength(3); // master_writer + master_reader + analytics_writer
    expect(dynamicModule.exports).toContain(getWriterToken('master'));
    expect(dynamicModule.exports).toContain(getReaderToken('master'));
    expect(dynamicModule.exports).toContain(getWriterToken('analytics'));
    expect(dynamicModule.exports).not.toContain(getReaderToken('analytics'));
  });
});
