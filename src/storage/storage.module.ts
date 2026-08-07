import { DynamicModule, Logger, Module } from '@nestjs/common';
import { StorageModuleOptions, StorageAdapter } from './storage.interface';
import { StorageService } from './storage.service';
import { STORAGE_SERVICE, STORAGE_ADAPTER, STORAGE_OPTIONS } from './storage.constants';

/**
 * StorageModule — unified file storage abstraction (local / S3 / GCS).
 *
 * ```ts
 * // Local filesystem
 * StorageModule.register({
 *   driver: 'local',
 *   local: { uploadDir: '/tmp/uploads', basePath: '/uploads' },
 *   maxFileSize: 5_000_000,
 *   allowedMimeTypes: ['image/*', 'application/pdf'],
 * })
 *
 * // AWS S3
 * StorageModule.register({
 *   driver: 's3',
 *   s3: { bucket: 'my-bucket', region: 'us-east-1' },
 * })
 *
 * // Google Cloud Storage
 * StorageModule.register({
 *   driver: 'gcs',
 *   gcs: { bucket: 'my-bucket', projectId: 'my-project', keyFilename: '/path/to/key.json' },
 * })
 * ```
 *
 * Inject the service: `@InjectStorage() storage: StorageService`
 */
@Module({})
export class StorageModule {
  private static readonly logger = new Logger('StorageModule');

  static register(options: StorageModuleOptions): DynamicModule {
    const adapterProvider = {
      provide: STORAGE_ADAPTER,
      useFactory: (): StorageAdapter => {
        switch (options.driver) {
          case 'local': {
            const { LocalAdapter } = require('./adapters/local.adapter');
            const uploadDir = options.local?.uploadDir ?? './uploads';
            const basePath = options.local?.basePath ?? '/uploads';
            StorageModule.logger.log(`Storage: local (${uploadDir})`);
            return new LocalAdapter(uploadDir, basePath);
          }

          case 's3': {
            if (!options.s3) {
              throw new Error('StorageModule: s3 options required when driver is "s3"');
            }
            try {
              const { S3Adapter } = require('./adapters/s3.adapter');
              StorageModule.logger.log(`Storage: S3 (${options.s3.bucket} / ${options.s3.region})`);
              return new S3Adapter(options.s3);
            } catch (err) {
              throw new Error(
                'StorageModule: S3 driver requires @aws-sdk/client-s3. ' +
                  'Install it: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner. ' +
                  `Original error: ${(err as Error).message}`,
              );
            }
          }

          case 'gcs': {
            if (!options.gcs) {
              throw new Error('StorageModule: gcs options required when driver is "gcs"');
            }
            try {
              const { GCSAdapter } = require('./adapters/gcs.adapter');
              StorageModule.logger.log(`Storage: GCS (${options.gcs.bucket})`);
              return new GCSAdapter(options.gcs);
            } catch (err) {
              throw new Error(
                'StorageModule: GCS driver requires @google-cloud/storage. ' +
                  'Install it: npm install @google-cloud/storage. ' +
                  `Original error: ${(err as Error).message}`,
              );
            }
          }

          default:
            throw new Error(`StorageModule: unknown driver "${(options as StorageModuleOptions).driver}"`);
        }
      },
    };

    return {
      module: StorageModule,
      providers: [
        adapterProvider,
        {
          provide: STORAGE_OPTIONS,
          useValue: options,
        },
        {
          provide: STORAGE_SERVICE,
          useClass: StorageService,
        },
        StorageService,
      ],
      exports: [STORAGE_SERVICE, StorageService],
    };
  }
}
