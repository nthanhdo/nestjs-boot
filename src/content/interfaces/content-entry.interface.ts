import type { EntryStatus } from '../enums/entry-status.enum';

/**
 * Content entry entity interface.
 */
export interface IContentEntry {
  id: string;
  contentTypeId: string;
  /** Dynamic field data stored as JSONB */
  data: Record<string, unknown>;
  locale: string;
  status: EntryStatus;
  version: number;
  slug?: string;
  publishedAt?: Date;
  scheduledAt?: Date;
  scheduledUnpublishAt?: Date;
  tenantId?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Content entry version snapshot.
 */
export interface IContentEntryVersion {
  id: string;
  entryId: string;
  version: number;
  data: Record<string, unknown>;
  changedBy?: string;
  createdAt: Date;
}

/**
 * Content asset entity interface.
 */
export interface IContentAsset {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  folder?: string;
  tags: string[];
  /** Localizable alt text: { en: "...", vi: "..." } */
  altText?: Record<string, string>;
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Content locale configuration.
 */
export interface IContentLocale {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  fallbackLocale?: string;
  tenantId?: string;
}

/**
 * Content API key for Delivery API access.
 */
export interface IContentApiKey {
  id: string;
  keyHash: string;
  name: string;
  environment: string;
  permissions: Record<string, unknown>;
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Content webhook configuration.
 */
export interface IContentWebhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Content webhook delivery log.
 */
export interface IContentWebhookLog {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  responseStatus?: number;
  attempt: number;
  createdAt: Date;
}

/**
 * Pagination result wrapper.
 */
export interface ContentPaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * Query filters for entry listing.
 */
export interface ContentEntryFilters {
  contentTypeId?: string;
  contentTypeSlug?: string;
  locale?: string;
  status?: EntryStatus;
  search?: string;
  createdBy?: string;
  filters?: Record<string, Record<string, unknown>>;
  sort?: string;
  page?: number;
  pageSize?: number;
  populate?: string[];
  fields?: string[];
  preview?: boolean;
}
