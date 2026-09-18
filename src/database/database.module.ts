import { DynamicModule, Global, Module } from '@nestjs/common';
import type { DatabaseOptions } from '../interfaces/boot-options.interface';
import { createConnectionModules } from './connection.factory';
import {
  getWriterToken,
  getReaderToken,
  getWriterConnectionName,
  getReaderConnectionName,
} from './constants';

function getMongoose() {
  try {
    return {
      getConnectionToken: require('@nestjs/mongoose').getConnectionToken,
      MongooseModule: require('@nestjs/mongoose').MongooseModule,
      mongoose: require('mongoose'),
    };
  } catch {
    throw new Error(
      '[nestjs-boot] @nestjs/mongoose and mongoose are required for MongoDB connections. Install them: npm install @nestjs/mongoose mongoose',
    );
  }
}

/**
 * Schema definition for forFeature — matches @nestjs/mongoose ModelDefinition.
 */
export interface ModelDefinition {
  name: string;
  schema: any; // mongoose.Schema — typed as any to avoid top-level mongoose import
  collection?: string;
  discriminators?: Array<{ name: string; schema: any }>;
}

/**
 * DatabaseModule — config-driven multi-connection MongoDB with reader/writer split.
 *
 * NOTE: @nestjs/mongoose and mongoose are loaded lazily. PostgreSQL-only apps
 * that use PrismaModule can import from `nestjs-boot/database` without installing
 * MongoDB dependencies.
 *
 * Usage:
 * ```ts
 * // Register connections:
 * DatabaseModule.register({
 *   connections: {
 *     master: { writerUri: '...', readerUri: '...' },
 *     analytics: { writerUri: '...' },
 *   },
 * })
 *
 * // Register schemas on a connection (auto-registers on both writer + reader):
 * DatabaseModule.forFeature('master', [
 *   { name: Product.name, schema: ProductSchema },
 * ])
 * ```
 */
@Global()
@Module({})
export class DatabaseModule {
  /**
   * Internal registry tracking which connection names have reader connections.
   */
  private static readonly connectionRegistry = new Map<string, boolean>();

  /**
   * Check if a connection has a reader configured.
   */
  static hasReader(connectionName: string): boolean {
    return this.connectionRegistry.get(connectionName) ?? false;
  }

  /**
   * Get all registered connection names.
   */
  static getRegisteredConnections(): string[] {
    return Array.from(this.connectionRegistry.keys());
  }

  /**
   * Register database connections from config.
   */
  static register(options: DatabaseOptions): DynamicModule {
    const { getConnectionToken } = getMongoose();
    const connectionModules = createConnectionModules(options);
    const connectionProviders: Array<{
      provide: string;
      useFactory: (connection: any) => any;
      inject: any[];
    }> = [];

    // Clear and rebuild registry
    this.connectionRegistry.clear();

    for (const [name, connectionConfig] of Object.entries(options.connections)) {
      const writerConnName = getWriterConnectionName(name);

      // Track whether this connection has a reader
      this.connectionRegistry.set(name, !!connectionConfig.readerUri);

      // Writer connection provider
      connectionProviders.push({
        provide: getWriterToken(name),
        useFactory: (connection: any) => connection,
        inject: [getConnectionToken(writerConnName)],
      });

      // Reader connection provider (if readerUri exists)
      if (connectionConfig.readerUri) {
        const readerConnName = getReaderConnectionName(name);
        connectionProviders.push({
          provide: getReaderToken(name),
          useFactory: (connection: any) => connection,
          inject: [getConnectionToken(readerConnName)],
        });
      }
    }

    const exportTokens = connectionProviders.map((p) => p.provide);

    return {
      module: DatabaseModule,
      global: true,
      imports: connectionModules,
      providers: connectionProviders,
      exports: exportTokens,
    };
  }

  /**
   * Register schemas on a named connection.
   * Automatically registers on BOTH writer AND reader connections (if reader exists).
   */
  static forFeature(
    connectionName: string,
    schemas: ModelDefinition[],
  ): DynamicModule {
    if (!this.connectionRegistry.has(connectionName)) {
      throw new Error(
        `[nestjs-boot] DatabaseModule.forFeature: unknown connection "${connectionName}". ` +
          `Registered connections: [${this.getRegisteredConnections().join(', ')}]. ` +
          `Did you call DatabaseModule.register() first?`,
      );
    }

    const { MongooseModule } = getMongoose();
    const writerConnName = getWriterConnectionName(connectionName);
    const imports: DynamicModule[] = [
      MongooseModule.forFeature(
        schemas.map((s: ModelDefinition) => ({
          name: s.name,
          schema: s.schema,
          collection: s.collection,
          discriminators: s.discriminators,
        })),
        writerConnName,
      ),
    ];

    // Also register on reader connection if it exists
    if (this.hasReader(connectionName)) {
      const readerConnName = getReaderConnectionName(connectionName);
      imports.push(
        MongooseModule.forFeature(
          schemas.map((s: ModelDefinition) => ({
            name: s.name,
            schema: s.schema,
            collection: s.collection,
            discriminators: s.discriminators,
          })),
          readerConnName,
        ),
      );
    }

    return {
      module: DatabaseModule,
      imports,
      exports: imports,
    };
  }
}
