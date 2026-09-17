import { DynamicModule, Global, Logger, Module, type Provider } from '@nestjs/common';
import type { ContentModuleOptions } from './interfaces/content-options.interface';
import { CONTENT_MODULE_OPTIONS } from './constants';
import { ContentTypeRepository } from './repositories/content-type.repository';
import { ContentEntryRepository } from './repositories/content-entry.repository';
import { ContentComponentRepository } from './repositories/content-component.repository';
import { ContentAssetRepository } from './repositories/content-asset.repository';
import { ContentLocaleRepository } from './repositories/content-locale.repository';
import { ContentApiKeyRepository } from './repositories/content-api-key.repository';
import { ContentWebhookRepository } from './repositories/content-webhook.repository';
import { ContentTypeService } from './services/content-type.service';
import { ContentEntryService } from './services/content-entry.service';
import { ContentVersionService } from './services/content-version.service';
import { ContentPublishingService } from './services/content-publishing.service';
import { ContentLocalizationService } from './services/content-localization.service';
import { ContentAssetService } from './services/content-asset.service';
import { ContentComponentService } from './services/content-component.service';
import { ContentSearchService } from './services/content-search.service';
import { ContentWebhookService } from './services/content-webhook.service';
import { ContentTypeController } from './controllers/content-type.controller';
import { ContentEntryController } from './controllers/content-entry.controller';
import { ContentAssetController } from './controllers/content-asset.controller';
import { ContentLocaleController } from './controllers/content-locale.controller';
import { ContentWebhookController } from './controllers/content-webhook.controller';
import { ContentApiKeyController } from './controllers/content-api-key.controller';
import { DeliveryController } from './controllers/delivery.controller';
import { MockUiController } from './controllers/mock-ui.controller';

const logger = new Logger('ContentModule');

@Global()
@Module({})
export class ContentModule {
  static register(options: ContentModuleOptions): DynamicModule {
    const opts: ContentModuleOptions = {
      enabled: true,
      enableCache: false,
      enableSearch: true,
      enableWebhooks: true,
      webhookRetryAttempts: 3,
      graphql: false,
      defaultLocale: 'en',
      supportedLocales: ['en'],
      managementPrefix: '/api/content',
      deliveryPrefix: '/api/delivery',
      defaultPageSize: 25,
      maxPopulateDepth: 3,
      cacheTtl: 300,
      scheduleCheckInterval: 60_000,
      ...options,
    };

    const providers: Provider[] = [
      { provide: CONTENT_MODULE_OPTIONS, useValue: opts },
      // Repositories
      ContentTypeRepository,
      ContentEntryRepository,
      ContentComponentRepository,
      ContentAssetRepository,
      ContentLocaleRepository,
      ContentApiKeyRepository,
      ContentWebhookRepository,
      // Services
      ContentTypeService,
      ContentEntryService,
      ContentVersionService,
      ContentPublishingService,
      ContentLocalizationService,
      ContentAssetService,
      ContentComponentService,
      ContentSearchService,
      ContentWebhookService,
    ];

    const controllers = [
      ContentTypeController,
      ContentEntryController,
      ContentAssetController,
      ContentLocaleController,
      ContentWebhookController,
      ContentApiKeyController,
      DeliveryController,
      MockUiController,
    ];

    // RAG semantic search — only if enabled
    if (opts.rag?.enabled) {
      try {
        const { ChunkingService } = require('./services/rag/chunking.service');
        const { RagEmbeddingService } = require('./services/rag/rag-embedding.service');
        const { RagSearchService } = require('./services/rag/rag-search.service');
        const { RagManagementService } = require('./services/rag/rag-management.service');
        const { RagManagementController } = require('./controllers/rag-management.controller');
        const { createEmbeddingProvider } = require('./services/rag/embedding-provider.factory');
        const { RAG_EMBEDDING_PROVIDER, RAG_EMBEDDING_SERVICE, RAG_SEARCH_SERVICE } = require('./constants');

        const embeddingProvider = createEmbeddingProvider(opts.rag);
        providers.push(
          { provide: RAG_EMBEDDING_PROVIDER, useValue: embeddingProvider },
          { provide: RAG_SEARCH_SERVICE, useClass: RagSearchService },
          { provide: RAG_EMBEDDING_SERVICE, useClass: RagEmbeddingService },
          ChunkingService,
          RagEmbeddingService,
          RagSearchService,
          RagManagementService,
        );
        controllers.push(RagManagementController);
        logger.log(`RAG semantic search enabled (provider: ${opts.rag.embeddingProvider}, model: ${opts.rag.model ?? 'text-embedding-3-small'})`);
      } catch (err) {
        logger.warn(`RAG enabled but initialization failed: ${err}`);
      }
    }

    // GraphQL resolver — only if enabled and deps available
    if (opts.graphql) {
      try {
        const { DeliveryGraphQLModule } = require('./controllers/delivery-graphql.module');
        logger.log('GraphQL delivery endpoint enabled');
        return {
          module: ContentModule,
          global: true,
          imports: [DeliveryGraphQLModule.register(opts)],
          providers,
          controllers,
          exports: [
            ContentTypeService,
            ContentEntryService,
            ContentPublishingService,
            ContentLocalizationService,
            ContentAssetService,
            ContentComponentService,
            ContentSearchService,
          ],
        };
      } catch {
        logger.warn(
          'GraphQL enabled but @nestjs/graphql not installed. Falling back to REST-only delivery.',
        );
      }
    }

    logger.log('Content service registered (REST delivery)');

    return {
      module: ContentModule,
      global: true,
      providers,
      controllers,
      exports: [
        ContentTypeService,
        ContentEntryService,
        ContentPublishingService,
        ContentLocalizationService,
        ContentAssetService,
        ContentComponentService,
        ContentSearchService,
      ],
    };
  }
}
