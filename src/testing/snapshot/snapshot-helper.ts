import { expect } from 'vitest';

/**
 * Options for snapshot comparison.
 */
export interface SnapshotOptions {
  /**
   * Field names to strip before comparison (applied recursively).
   * Common volatile fields: _id, createdAt, updatedAt, __v
   */
  ignore?: string[];

  /**
   * Custom name for the snapshot (passed to toMatchSnapshot).
   */
  name?: string;
}

/**
 * Recursively strip fields from an object or array.
 */
function stripFields(data: any, fields: string[]): any {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map((item) => stripFields(item, fields));
  }

  if (typeof data === 'object' && data !== null) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (fields.includes(key)) continue;
      result[key] = stripFields(value, fields);
    }
    return result;
  }

  return data;
}

/**
 * Default volatile fields that are stripped from API responses before snapshot comparison.
 */
const DEFAULT_VOLATILE_FIELDS = ['_id', 'id', 'createdAt', 'updatedAt', '__v'];

/**
 * API response snapshot testing helper.
 * Strips volatile fields (timestamps, IDs) before comparison.
 *
 * ```ts
 * const res = await client.get('/products/123');
 * expectSnapshot(res.data, {
 *   ignore: ['_id', 'createdAt', 'updatedAt'],
 * });
 * ```
 */
export function expectSnapshot(data: any, options?: SnapshotOptions): void {
  const fieldsToIgnore = options?.ignore ?? DEFAULT_VOLATILE_FIELDS;
  const cleaned = stripFields(data, fieldsToIgnore);

  if (options?.name) {
    expect(cleaned).toMatchSnapshot(options.name);
  } else {
    expect(cleaned).toMatchSnapshot();
  }
}

/**
 * Strip volatile fields from data without running a snapshot assertion.
 * Useful when you want to do custom comparisons on cleaned data.
 *
 * ```ts
 * const cleaned = stripVolatileFields(res.data, ['_id', 'updatedAt']);
 * expect(cleaned).toEqual({ name: 'Test', price: 42 });
 * ```
 */
export function stripVolatileFields(data: any, fields?: string[]): any {
  return stripFields(data, fields ?? DEFAULT_VOLATILE_FIELDS);
}
