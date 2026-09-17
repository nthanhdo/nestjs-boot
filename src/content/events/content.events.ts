/**
 * Content event types for webhook dispatch.
 */
export const ContentEvents = {
  ENTRY_CREATED: 'entry.created',
  ENTRY_UPDATED: 'entry.updated',
  ENTRY_DELETED: 'entry.deleted',
  ENTRY_PUBLISHED: 'entry.published',
  ENTRY_UNPUBLISHED: 'entry.unpublished',
  ENTRY_STATUS_CHANGED: 'entry.status_changed',
  TYPE_CREATED: 'content-type.created',
  TYPE_UPDATED: 'content-type.updated',
  TYPE_DELETED: 'content-type.deleted',
  ASSET_UPLOADED: 'asset.uploaded',
  ASSET_DELETED: 'asset.deleted',
} as const;

export type ContentEventType = typeof ContentEvents[keyof typeof ContentEvents];
