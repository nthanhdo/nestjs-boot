import { DynamicModule, Module, Logger } from '@nestjs/common';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';

const logger = new Logger('DeliveryGraphQLModule');

/**
 * Dynamically registers a GraphQL endpoint for the Delivery API.
 * Requires @nestjs/graphql + @nestjs/apollo + @apollo/server peer dependencies.
 *
 * The schema is code-first and dynamically generated based on registered content types.
 * Provides: Query { contentTypes, entries(type, locale), entry(slug, locale), asset(id) }
 */
@Module({})
export class DeliveryGraphQLModule {
  static register(_options: ContentModuleOptions): DynamicModule {
    try {
      const { GraphQLModule } = require('@nestjs/graphql');
      const { ApolloDriver } = require('@nestjs/apollo');
      const { DeliveryGraphQLResolver } = require('./delivery-graphql.resolver');

      logger.log('GraphQL delivery endpoint registered at /graphql');

      return {
        module: DeliveryGraphQLModule,
        imports: [
          GraphQLModule.forRoot({
            driver: ApolloDriver,
            autoSchemaFile: true,
            sortSchema: true,
            path: '/graphql',
            playground: process.env.NODE_ENV !== 'production',
            introspection: process.env.NODE_ENV !== 'production',
            context: ({ req }: { req: any }) => ({ req }),
          }),
        ],
        providers: [DeliveryGraphQLResolver],
      };
    } catch (err) {
      logger.warn(
        'GraphQL dependencies not installed. Install: npm i @nestjs/graphql @nestjs/apollo @apollo/server graphql',
      );
      return {
        module: DeliveryGraphQLModule,
      };
    }
  }
}
