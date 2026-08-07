import { Connection, Model, Schema } from 'mongoose';

/**
 * Factory field definition — either a static value or a generator function.
 */
type FieldDef<T> = T | (() => T);

/**
 * Factory defaults — each field is either a static value or a generator.
 */
type FactoryDefaults<T> = {
  [K in keyof T]?: FieldDef<T[K]>;
};

/**
 * A test factory for creating documents from a Mongoose schema.
 *
 * ```ts
 * const productFactory = createFactory<Product>('Product', ProductSchema, {
 *   name: () => `Product ${Math.random().toString(36).slice(2)}`,
 *   price: () => Math.random() * 100,
 *   category: 'electronics',
 * });
 *
 * const product = await productFactory.create(connection);
 * const products = await productFactory.createMany(5, connection);
 * const custom = await productFactory.create(connection, { price: 99.99 });
 * ```
 */
export interface TestFactory<T> {
  /** Build a plain object (no DB write) with defaults + overrides. */
  build(overrides?: Partial<T>): T;
  /** Build N plain objects. */
  buildMany(count: number, overrides?: Partial<T>): T[];
  /** Create a document in the database. */
  create(connection: Connection, overrides?: Partial<T>): Promise<T & { _id: any }>;
  /** Create N documents in the database. */
  createMany(count: number, connection: Connection, overrides?: Partial<T>): Promise<(T & { _id: any })[]>;
}

/**
 * Create a test factory for a Mongoose model.
 *
 * @param modelName - Mongoose model name (e.g., 'Product')
 * @param schema - Mongoose schema instance
 * @param defaults - Default field values (static or generator functions)
 */
export function createFactory<T extends Record<string, any>>(
  modelName: string,
  schema: Schema,
  defaults: FactoryDefaults<T>,
): TestFactory<T> {
  function resolveDefaults(overrides?: Partial<T>): T {
    const result: Record<string, any> = {};

    for (const [key, def] of Object.entries(defaults)) {
      result[key] = typeof def === 'function' ? (def as () => any)() : def;
    }

    if (overrides) {
      Object.assign(result, overrides);
    }

    return result as T;
  }

  function getModel(connection: Connection): Model<any> {
    try {
      return connection.model(modelName);
    } catch {
      return connection.model(modelName, schema);
    }
  }

  return {
    build(overrides?: Partial<T>): T {
      return resolveDefaults(overrides);
    },

    buildMany(count: number, overrides?: Partial<T>): T[] {
      return Array.from({ length: count }, () => resolveDefaults(overrides));
    },

    async create(connection: Connection, overrides?: Partial<T>): Promise<T & { _id: any }> {
      const model = getModel(connection);
      const data = resolveDefaults(overrides);
      const doc = await model.create(data);
      return doc.toObject() as T & { _id: any };
    },

    async createMany(count: number, connection: Connection, overrides?: Partial<T>): Promise<(T & { _id: any })[]> {
      const model = getModel(connection);
      const items = Array.from({ length: count }, () => resolveDefaults(overrides));
      const docs = await model.insertMany(items);
      return docs.map((d: any) => (d.toObject ? d.toObject() : d)) as (T & { _id: any })[];
    },
  };
}
