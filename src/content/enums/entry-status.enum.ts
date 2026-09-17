export enum EntryStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  SCHEDULED = 'SCHEDULED',
  PUBLISHED = 'PUBLISHED',
  REJECTED = 'REJECTED',
  UNPUBLISHED = 'UNPUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Allowed state transitions for content entries.
 * Key = current status, Value = array of allowed next statuses.
 */
export const ENTRY_STATUS_TRANSITIONS: Record<EntryStatus, EntryStatus[]> = {
  [EntryStatus.DRAFT]: [EntryStatus.APPROVED, EntryStatus.ARCHIVED],
  [EntryStatus.APPROVED]: [EntryStatus.PUBLISHED, EntryStatus.SCHEDULED, EntryStatus.REJECTED],
  [EntryStatus.SCHEDULED]: [EntryStatus.PUBLISHED, EntryStatus.APPROVED, EntryStatus.REJECTED],
  [EntryStatus.PUBLISHED]: [EntryStatus.UNPUBLISHED, EntryStatus.ARCHIVED],
  [EntryStatus.REJECTED]: [EntryStatus.DRAFT],
  [EntryStatus.UNPUBLISHED]: [EntryStatus.DRAFT, EntryStatus.ARCHIVED],
  [EntryStatus.ARCHIVED]: [EntryStatus.DRAFT],
};
