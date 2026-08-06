import { DynamicModule, Global, Module } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
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
 *
 * For model registration, use standard MongooseModule.forFeature with connection name helpers:
 * ```ts
 * MongooseModule.forFeature(
 *   [{ name: Product.name, schema: ProductSchema }],
 *   getWriterConnectionName('master'),
 * )
 * // Then inject with: @InjectModel(Product.name, getWriterConnectionName('master'))
 * ```
 */
@Global()
@Module({})
export class DatabaseModule {
  static register(options: DatabaseOptions): DynamicModule {
    const connectionModules = createConnectionModules(options);
    const connectionProviders: Array<{ provide: string; useFactory: (connection: mongoose.Connection) => mongoose.Connection; inject: any[] }> = [];

    for (const [name, connectionConfig] of Object.entries(options.connections)) {
      const writerConnName = getWriterConnectionName(name);

      // Writer connection provider — injected via @nestjs/mongoose DI token
      connectionProviders.push({
        provide: getWriterToken(name),
        useFactory: (connection: mongoose.Connection) => connection,
        inject: [getConnectionToken(writerConnName)],
      });

      // Reader connection provider (if readerUri exists)
      if (connectionConfig.readerUri) {
        const readerConnName = getReaderConnectionName(name);
        connectionProviders.push({
          provide: getReaderToken(name),
          useFactory: (connection: mongoose.Connection) => connection,
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
}
