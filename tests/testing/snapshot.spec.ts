import { describe, it, expect } from 'vitest';
import { stripVolatileFields, expectSnapshot } from '../../src/testing';

describe('Snapshot helpers', () => {
  it('strips volatile fields recursively', () => {
    const data = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Widget',
      price: 9.99,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      __v: 0,
      nested: {
        _id: 'inner-id',
        value: 42,
        items: [
          { _id: 'item1', label: 'A' },
          { _id: 'item2', label: 'B' },
        ],
      },
    };

    const cleaned = stripVolatileFields(data);

    expect(cleaned).toEqual({
      name: 'Widget',
      price: 9.99,
      nested: {
        value: 42,
        items: [
          { label: 'A' },
          { label: 'B' },
        ],
      },
    });
    expect(cleaned._id).toBeUndefined();
    expect(cleaned.createdAt).toBeUndefined();
    expect(cleaned.__v).toBeUndefined();
  });

  it('matches snapshot with volatile fields stripped', () => {
    const data = {
      _id: 'will-be-different-every-run',
      name: 'Stable Product',
      price: 42,
      createdAt: new Date().toISOString(),
    };

    // This should match snapshot consistently since volatile fields are stripped
    expectSnapshot(data);
  });

  it('supports custom ignore list', () => {
    const data = {
      _id: '123',
      name: 'Test',
      secretField: 'should-be-stripped',
      price: 10,
    };

    const cleaned = stripVolatileFields(data, ['secretField']);
    expect(cleaned.name).toBe('Test');
    expect(cleaned.price).toBe(10);
    expect(cleaned._id).toBe('123'); // not in custom ignore list
    expect(cleaned.secretField).toBeUndefined();
  });
});
