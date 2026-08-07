import { Connection, Model, Schema } from 'mongoose';

/**
 * Factory field definition — either a static value or a generator function.
 * Generator functions receive a sequence number (auto-incrementing per factory).
 */
type FieldDef<T> = T | ((seq: number) => T);

/**
 * Factory defaults — each field is either a static value or a generator.
 */
type FactoryDefaults<T> = {
  [K in keyof T]?: FieldDef<T[K]>;
};

/**
 * Factory options — traits and hooks.
 */
export interface FactoryOptions<T> {
  /** Named variants that override specific fields. */
  traits?: Record<string, Partial<FactoryDefaults<T>>>;
  /** Hook called after a document is created in the database. */
  afterCreate?: (doc: T & { _id: any }, connection: Connection) => Promise<void>;
}

/**
 * A test factory for creating documents from a Mongoose schema.
 */
export interface TestFactory<T> {
  /** Build a plain object (no DB write) with defaults + overrides. */
  build(overrides?: Partial<T>): T;
  /** Build with a named trait applied. */
  build(trait: string, overrides?: Partial<T>): T;
  /** Build N plain objects. */
  buildMany(count: number, overrides?: Partial<T>): T[];
  /** Build N plain objects with a named trait. */
  buildMany(count: number, trait: string, overrides?: Partial<T>): T[];
  /** Create a document in the database. */
  create(connection: Connection, overrides?: Partial<T>): Promise<T & { _id: any }>;
  /** Create a document with a named trait. */
  create(connection: Connection, trait: string, overrides?: Partial<T>): Promise<T & { _id: any }>;
  /** Create N documents in the database. */
  createMany(count: number, connection: Connection, overrides?: Partial<T>): Promise<(T & { _id: any })[]>;
  /** Create N documents with a named trait. */
  createMany(count: number, connection: Connection, trait: string, overrides?: Partial<T>): Promise<(T & { _id: any })[]>;
  /** Reset the sequence counter. */
  resetSequence(): void;
}

/**
 * Create a test factory for a Mongoose model.
 */
export function createFactory<T extends Record<string, any>>(
  modelName: string,
  schema: Schema,
  defaults: FactoryDefaults<T>,
  factoryOptions?: FactoryOptions<T>,
): TestFactory<T> {
  let sequence = 0;
  const traits = factoryOptions?.traits ?? {};
  const afterCreateHook = factoryOptions?.afterCreate;

  function nextSeq(): number {
    return ++sequence;
  }

  function resolveFields(defs: FactoryDefaults<T>, seq: number): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, def] of Object.entries(defs)) {
      result[key] = typeof def === 'function' ? (def as (s: number) => any)(seq) : def;
    }
    return result;
  }

  function resolveDefaults(traitOrOverrides?: string | Partial<T>, overrides?: Partial<T>): T {
    const seq = nextSeq();
    const result = resolveFields(defaults, seq);

    let traitName: string | undefined;
    let actualOverrides: Partial<T> | undefined;

    if (typeof traitOrOverrides === 'string') {
      traitName = traitOrOverrides;
      actualOverrides = overrides;
    } else {
      actualOverrides = traitOrOverrides;
    }

    if (traitName) {
      const traitDefs = traits[traitName];
      if (!traitDefs) {
        throw new Error(`[nestjs-boot] Unknown factory trait: "${traitName}". Available: ${Object.keys(traits).join(', ') || 'none'}`);
      }
      const traitResolved = resolveFields(traitDefs as FactoryDefaults<T>, seq);
      Object.assign(result, traitResolved);
    }

    if (actualOverrides) {
      Object.assign(result, actualOverrides);
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
    build(traitOrOverrides?: string | Partial<T>, overrides?: Partial<T>): T {
      return resolveDefaults(traitOrOverrides, overrides);
    },

    buildMany(count: number, traitOrOverrides?: string | Partial<T>, overrides?: Partial<T>): T[] {
      return Array.from({ length: count }, () => resolveDefaults(traitOrOverrides, overrides));
    },

    async create(connection: Connection, traitOrOverrides?: string | Partial<T>, overrides?: Partial<T>): Promise<T & { _id: any }> {
      const model = getModel(connection);
      const data = resolveDefaults(traitOrOverrides, overrides);
      const doc = await model.create(data);
      const result = doc.toObject() as T & { _id: any };
      if (afterCreateHook) {
        await afterCreateHook(result, connection);
      }
      return result;
    },

    async createMany(count: number, connection: Connection, traitOrOverrides?: string | Partial<T>, overrides?: Partial<T>): Promise<(T & { _id: any })[]> {
      const model = getModel(connection);
      const items = Array.from({ length: count }, () => resolveDefaults(traitOrOverrides, overrides));
      const docs = await model.insertMany(items);
      const results = docs.map((d: any) => (d.toObject ? d.toObject() : d)) as (T & { _id: any })[];
      if (afterCreateHook) {
        for (const r of results) {
          await afterCreateHook(r, connection);
        }
      }
      return results;
    },

    resetSequence() {
      sequence = 0;
    },
  };
}
