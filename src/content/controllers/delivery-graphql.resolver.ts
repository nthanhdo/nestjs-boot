import { Inject } from '@nestjs/common';
import { ContentTypeService } from '../services/content-type.service';
import { ContentEntryService } from '../services/content-entry.service';
import { ContentAssetService } from '../services/content-asset.service';
import { ContentSearchService } from '../services/content-search.service';
import { CONTENT_MODULE_OPTIONS } from '../constants';
import { EntryStatus } from '../enums/entry-status.enum';
import type { ContentModuleOptions } from '../interfaces/content-options.interface';

let Resolver: any;
let Query: any;
let Args: any;
let ObjectType: any;
let Field: any;
let ID: any;
let Int: any;
let GraphQLJSON: any;

try {
  const graphql = require('@nestjs/graphql');
  Resolver = graphql.Resolver;
  Query = graphql.Query;
  Args = graphql.Args;
  ObjectType = graphql.ObjectType;
  Field = graphql.Field;
  ID = graphql.ID;
  Int = graphql.Int;
  GraphQLJSON = require('graphql-type-json').default ?? require('graphql-type-json');
} catch {
  // GraphQL deps not available — resolver won't be registered
  Resolver = () => (target: any) => target;
  Query = () => () => {};
  Args = () => () => {};
  ObjectType = () => (target: any) => target;
  Field = () => () => {};
  ID = String;
  Int = Number;
  GraphQLJSON = Object;
}

@ObjectType('ContentType')
class GqlContentType {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field() slug!: string;
  @Field({ nullable: true }) description?: string;
  @Field(() => GraphQLJSON) fields!: any;
  @Field(() => [String]) components!: string[];
}

@ObjectType('ContentEntry')
class GqlContentEntry {
  @Field(() => ID) id!: string;
  @Field() contentTypeId!: string;
  @Field(() => GraphQLJSON) data!: any;
  @Field() locale!: string;
  @Field() status!: string;
  @Field(() => Int) version!: number;
  @Field({ nullable: true }) slug?: string;
  @Field({ nullable: true }) publishedAt?: Date;
}

@ObjectType('ContentAsset')
class GqlContentAsset {
  @Field(() => ID) id!: string;
  @Field() filename!: string;
  @Field() mimeType!: string;
  @Field() storageKey!: string;
  @Field({ nullable: true }) folder?: string;
  @Field(() => [String]) tags!: string[];
  @Field(() => GraphQLJSON, { nullable: true }) altText?: any;
}

@ObjectType('PaginationMeta')
class GqlPaginationMeta {
  @Field(() => Int) total!: number;
  @Field(() => Int) page!: number;
  @Field(() => Int) pageSize!: number;
  @Field(() => Int) totalPages!: number;
}

@ObjectType('EntryList')
class GqlEntryList {
  @Field(() => [GqlContentEntry]) data!: GqlContentEntry[];
  @Field(() => GqlPaginationMeta) meta!: GqlPaginationMeta;
}

/**
 * GraphQL resolver for the Delivery API.
 * All queries return only PUBLISHED entries (unless preview mode).
 */
@Resolver()
export class DeliveryGraphQLResolver {
  constructor(
    private readonly typeService: ContentTypeService,
    private readonly entryService: ContentEntryService,
    private readonly assetService: ContentAssetService,
    private readonly searchService: ContentSearchService,
    @Inject(CONTENT_MODULE_OPTIONS) private readonly options: ContentModuleOptions,
  ) {}

  @Query(() => [GqlContentType], { name: 'contentTypes' })
  async getContentTypes(): Promise<any[]> {
    return this.typeService.findAll();
  }

  @Query(() => GqlEntryList, { name: 'entries' })
  async getEntries(
    @Args('type', { nullable: true }) contentTypeSlug?: string,
    @Args('locale', { nullable: true }) locale?: string,
    @Args('search', { nullable: true }) search?: string,
    @Args('page', { type: () => Int, nullable: true }) page?: number,
    @Args('pageSize', { type: () => Int, nullable: true }) pageSize?: number,
  ): Promise<any> {
    const requestedLocale = locale ?? this.options.defaultLocale ?? 'en';

    if (search) {
      return this.searchService.search({
        query: search,
        locale: requestedLocale,
        status: EntryStatus.PUBLISHED,
        page,
        pageSize,
      });
    }

    return this.entryService.findAll({
      contentTypeSlug,
      locale: requestedLocale,
      status: EntryStatus.PUBLISHED,
      page,
      pageSize,
    });
  }

  @Query(() => GqlContentEntry, { name: 'entry', nullable: true })
  async getEntry(
    @Args('slug') slug: string,
    @Args('locale', { nullable: true }) locale?: string,
  ): Promise<any> {
    const requestedLocale = locale ?? this.options.defaultLocale ?? 'en';
    try {
      const entry = await this.entryService.findBySlug(slug, requestedLocale);
      if (entry.status !== EntryStatus.PUBLISHED) return null;
      return entry;
    } catch {
      return null;
    }
  }

  @Query(() => GqlContentAsset, { name: 'asset', nullable: true })
  async getAsset(@Args('id') id: string): Promise<any> {
    try {
      return await this.assetService.findById(id);
    } catch {
      return null;
    }
  }
}
