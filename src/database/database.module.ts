import { DynamicModule, Global, Module } from '@nestjs/common';
import mongoose from 'mongoose';
import { DatabaseOptions } from '../interfaces/boot-options.interface';
import { createConnectionModules } from './connection.factory';
import {
  getWriterToken,
  getReaderToken,
  getWriterConnectionName,
  getReaderConnectionName,
} from './constants';

/**
 * DatabaseModule — config-driven multi-connection MongoDB with reader/writer split.
 *
 * Usage:
 * ```ts
 * DatabaseModule.register({
 *   connections: {
 *     master: { writerUri: '...', readerUri: '...' },
 *     analytics: { writerUri: '...' },
 *   },
 * })
 * ```
 */
@Global()
@Module({})
export class DatabaseModule {
  static register(options: DatabaseOptions): DynamicModule {
    const connectionModules = createConnectionModules(options);
    const connectionProviders: Array<{ provide: string; useFactory: () => mongoose.Connection }> = [];

    for (const [name, connectionConfig] of Object.entries(options.connections)) {
      // Writer connection provider
      connectionProviders.push({
        provide: getWriterToken(name),
        useFactory: () => mongoose.connections.find(
          (c) => c.name === getWriterConnectionName(name),
        ) as mongoose.Connection,
      });

      // Reader connection provider (if readerUri exists)
      if (connectionConfig.readerUri) {
        connectionProviders.push({
          provide: getReaderToken(name),
          useFactory: () => mongoose.connections.find(
            (c) => c.name === getReaderConnectionName(name),
          ) as mongoose.Connection,
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
}
