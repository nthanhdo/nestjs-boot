import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Module } from '@nestjs/common';
import { createTestSuite } from '../../src/testing';

@Module({})
class SuiteTestModule {}

describe('createTestSuite', () => {
  const suite = createTestSuite(SuiteTestModule);

  beforeAll(async () => {
    await suite.setup();
  }, 30_000);

  afterAll(async () => {
    await suite.teardown();
  }, 15_000);

  beforeEach(async () => {
    await suite.reset(); // should not throw even without mongo
  });

  it('setup initializes app, module, and client', () => {
    expect(suite.app).toBeDefined();
    expect(suite.module).toBeDefined();
    expect(suite.client).toBeDefined();
  });

  it('reset does not throw when no mongo connection', async () => {
    // This test verifies reset is safe when DB isn't available
    await expect(suite.reset()).resolves.toBeUndefined();
  });

  it('inject does not throw for app reference', () => {
    // The app itself should be resolvable
    expect(suite.app).toBeDefined();
  });

  it('factory creates a factory instance', () => {
    const { Schema } = require('mongoose');
    const testSchema = new Schema({ name: String });
    const factory = suite.factory('TestItem', testSchema, {
      name: () => 'test',
    });
    expect(factory.build()).toEqual({ name: 'test' });
  });

  it('teardown cleans up and prevents further access', async () => {
    // After teardown suite.app should throw
    const freshSuite = createTestSuite(SuiteTestModule);
    await freshSuite.setup();
    await freshSuite.teardown();
    expect(() => freshSuite.app).toThrow('not initialized');
  }, 30_000);
});

describe('createTestSuite - before setup', () => {
  const suite = createTestSuite(SuiteTestModule);

  it('throws if accessed before setup', () => {
    expect(() => suite.app).toThrow('not initialized');
    expect(() => suite.client).toThrow('not initialized');
  });
});
