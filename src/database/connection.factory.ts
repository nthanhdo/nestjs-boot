import { DynamicModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseOptions } from '../interfaces/boot-options.interface';
import { getWriterConnectionName, getReaderConnectionName } from './constants';

/**
 * Creates an array of MongooseModule.forRoot DynamicModules from DatabaseOptions.
 * For each named connection, creates a writer connection and optionally a reader connection.
 */
export function createConnectionModules(options: DatabaseOptions): DynamicModule[] {
  const modules: DynamicModule[] = [];

  for (const [name, connectionConfig] of Object.entries(options.connections)) {
    // Writer connection (always created)
    modules.push(
      MongooseModule.forRoot(connectionConfig.writerUri, {
        connectionName: getWriterConnectionName(name),
      } as Parameters<typeof MongooseModule.forRoot>[1]),
    );

    // Reader connection (only if readerUri provided)
    if (connectionConfig.readerUri) {
      modules.push(
        MongooseModule.forRoot(connectionConfig.readerUri, {
          connectionName: getReaderConnectionName(name),
        } as Parameters<typeof MongooseModule.forRoot>[1]),
      );
    }
  }

  return modules;
}
