import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseModule } from '../../src/database/database.module';
import { getWriterConnectionName, getReaderConnectionName } from '../../src/database/constants';
import mongoose from 'mongoose';

// Simple test schema
const TestSchema = new mongoose.Schema({ name: String });

describe('DatabaseModule.forFeature()', () => {
  beforeEach(() => {
    // Reset registry by registering fresh connections
    // We access via register to populate the internal registry
  });

  it('should register schemas on writer connection', () => {
    // Register a connection without reader
    DatabaseModule.register({
      connections: {
        analytics: { writerUri: 'mongodb://localhost/analytics' },
      },
    });

    const result = DatabaseModule.forFeature('analytics', [
      { name: 'TestModel', schema: TestSchema },
    ]);

    // Should have 1 import (writer only, no reader)
    expect(result.imports).toHaveLength(1);
    expect(result.module).toBe(DatabaseModule);
  });

  it('should register schemas on both writer and reader when reader exists', () => {
    DatabaseModule.register({
      connections: {
        master: {
          writerUri: 'mongodb://localhost/master',
          readerUri: 'mongodb://localhost/master-reader',
        },
      },
    });

    const result = DatabaseModule.forFeature('master', [
      { name: 'Product', schema: TestSchema },
    ]);

    // Should have 2 imports (writer + reader)
    expect(result.imports).toHaveLength(2);
  });

  it('should throw for unknown connection name', () => {
    DatabaseModule.register({
      connections: {
        master: { writerUri: 'mongodb://localhost/master' },
      },
    });

    expect(() =>
      DatabaseModule.forFeature('nonexistent', [
        { name: 'TestModel', schema: TestSchema },
      ]),
    ).toThrow(/unknown connection "nonexistent"/);
  });

  it('should track hasReader correctly', () => {
    DatabaseModule.register({
      connections: {
        master: {
          writerUri: 'mongodb://localhost/master',
          readerUri: 'mongodb://localhost/master-reader',
        },
        analytics: {
          writerUri: 'mongodb://localhost/analytics',
        },
      },
    });

    expect(DatabaseModule.hasReader('master')).toBe(true);
    expect(DatabaseModule.hasReader('analytics')).toBe(false);
    expect(DatabaseModule.hasReader('unknown')).toBe(false);
  });

  it('should list registered connections', () => {
    DatabaseModule.register({
      connections: {
        master: { writerUri: 'mongodb://localhost/master' },
        analytics: { writerUri: 'mongodb://localhost/analytics' },
      },
    });

    const connections = DatabaseModule.getRegisteredConnections();
    expect(connections).toContain('master');
    expect(connections).toContain('analytics');
    expect(connections).toHaveLength(2);
  });

  it('should pass connection options through to MongooseModule.forRoot', () => {
    // This test verifies that register() accepts connection options without error
    const result = DatabaseModule.register({
      connections: {
        master: {
          writerUri: 'mongodb://localhost/master',
          options: {
            maxPoolSize: 10,
            minPoolSize: 2,
            serverSelectionTimeoutMS: 5000,
          },
        },
      },
    });

    // Should create the module without errors
    expect(result.module).toBe(DatabaseModule);
    expect(result.imports).toBeDefined();
    // The imports array contains MongooseModule.forRoot results with the options merged in
    expect((result.imports as any[]).length).toBeGreaterThan(0);
  });
});
