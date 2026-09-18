import { DynamicModule, Logger } from '@nestjs/common';
import type { DatabaseOptions } from '../interfaces/boot-options.interface';
import { getWriterConnectionName, getReaderConnectionName } from './constants';

function getMongooseModule(): { forRoot: (uri: string, options?: any) => DynamicModule } {
  try {
    const mod = require('@nestjs/mongoose');
    return mod.MongooseModule;
  } catch {
    throw new Error(
      '[nestjs-boot] @nestjs/mongoose is required for MongoDB connections. Install it: npm install @nestjs/mongoose mongoose',
    );
  }
}

const logger = new Logger('DatabaseModule');

/**
 * Creates an array of MongooseModule.forRoot DynamicModules from DatabaseOptions.
 * For each named connection, creates a writer connection and optionally a reader connection.
 * Passes through Mongoose connection options (pool size, auth, etc.) when provided.
 *
 * NOTE: @nestjs/mongoose is loaded lazily — only crashes if this function is actually called
 * without @nestjs/mongoose installed. PostgreSQL-only apps that use PrismaModule are unaffected.
 */
export function createConnectionModules(options: DatabaseOptions): DynamicModule[] {
  const MongooseModule = getMongooseModule();
  const modules: DynamicModule[] = [];

  for (const [name, connectionConfig] of Object.entries(options.connections)) {
    const mongooseOptions = connectionConfig.options ?? {};

    // Writer connection (always created)
    const writerConnName = getWriterConnectionName(name);
    modules.push(
      MongooseModule.forRoot(connectionConfig.writerUri, {
        connectionName: writerConnName,
        ...mongooseOptions,
        connectionFactory: (connection: any) => {
          connection.on('connected', () => {
            logger.log(`[${name}] Writer connection established`);
          });
          connection.on('disconnected', () => {
            logger.warn(`[${name}] Writer connection disconnected`);
          });
          connection.on('error', (err: Error) => {
            logger.error(`[${name}] Writer connection error: ${err.message}`);
          });
          return connection;
        },
      }),
    );

    // Reader connection (only if readerUri provided)
    if (connectionConfig.readerUri) {
      const readerConnName = getReaderConnectionName(name);
      modules.push(
        MongooseModule.forRoot(connectionConfig.readerUri, {
          connectionName: readerConnName,
          ...mongooseOptions,
          connectionFactory: (connection: any) => {
            connection.on('connected', () => {
              logger.log(`[${name}] Reader connection established`);
            });
            connection.on('disconnected', () => {
              logger.warn(`[${name}] Reader connection disconnected`);
            });
            connection.on('error', (err: Error) => {
              logger.error(`[${name}] Reader connection error: ${err.message}`);
            });
            return connection;
          },
        }),
      );
    }
  }

  return modules;
}
