import { DynamicModule, Logger } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseOptions } from '../interfaces/boot-options.interface';
import { getWriterConnectionName, getReaderConnectionName } from './constants';

const logger = new Logger('DatabaseModule');

/**
 * Creates an array of MongooseModule.forRoot DynamicModules from DatabaseOptions.
 * For each named connection, creates a writer connection and optionally a reader connection.
 * Passes through Mongoose connection options (pool size, auth, etc.) when provided.
 */
export function createConnectionModules(options: DatabaseOptions): DynamicModule[] {
  const modules: DynamicModule[] = [];

  for (const [name, connectionConfig] of Object.entries(options.connections)) {
    const mongooseOptions = connectionConfig.options ?? {};

    // Writer connection (always created)
    const writerConnName = getWriterConnectionName(name);
    modules.push(
      MongooseModule.forRoot(connectionConfig.writerUri, {
        connectionName: writerConnName,
        ...mongooseOptions,
        connectionFactory: (connection) => {
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
      } as Parameters<typeof MongooseModule.forRoot>[1]),
    );

    // Reader connection (only if readerUri provided)
    if (connectionConfig.readerUri) {
      const readerConnName = getReaderConnectionName(name);
      modules.push(
        MongooseModule.forRoot(connectionConfig.readerUri, {
          connectionName: readerConnName,
          ...mongooseOptions,
          connectionFactory: (connection) => {
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
        } as Parameters<typeof MongooseModule.forRoot>[1]),
      );
    }
  }

  return modules;
}
