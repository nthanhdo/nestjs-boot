import { describe, it, expect } from 'vitest';
import { EntryStatus, ENTRY_STATUS_TRANSITIONS } from '../../src/content/enums/entry-status.enum';

describe('EntryStatus', () => {
  it('should define all status values', () => {
    expect(EntryStatus.DRAFT).toBe('DRAFT');
    expect(EntryStatus.APPROVED).toBe('APPROVED');
    expect(EntryStatus.SCHEDULED).toBe('SCHEDULED');
    expect(EntryStatus.PUBLISHED).toBe('PUBLISHED');
    expect(EntryStatus.REJECTED).toBe('REJECTED');
    expect(EntryStatus.UNPUBLISHED).toBe('UNPUBLISHED');
    expect(EntryStatus.ARCHIVED).toBe('ARCHIVED');
  });

  it('should define valid transitions from DRAFT', () => {
    expect(ENTRY_STATUS_TRANSITIONS[EntryStatus.DRAFT]).toEqual([
      EntryStatus.APPROVED,
      EntryStatus.ARCHIVED,
    ]);
  });

  it('should define valid transitions from APPROVED', () => {
    expect(ENTRY_STATUS_TRANSITIONS[EntryStatus.APPROVED]).toEqual([
      EntryStatus.PUBLISHED,
      EntryStatus.SCHEDULED,
      EntryStatus.REJECTED,
    ]);
  });

  it('should define valid transitions from PUBLISHED', () => {
    expect(ENTRY_STATUS_TRANSITIONS[EntryStatus.PUBLISHED]).toEqual([
      EntryStatus.UNPUBLISHED,
      EntryStatus.ARCHIVED,
    ]);
  });

  it('should allow REJECTED to go back to DRAFT', () => {
    expect(ENTRY_STATUS_TRANSITIONS[EntryStatus.REJECTED]).toEqual([EntryStatus.DRAFT]);
  });

  it('should allow ARCHIVED to go back to DRAFT', () => {
    expect(ENTRY_STATUS_TRANSITIONS[EntryStatus.ARCHIVED]).toEqual([EntryStatus.DRAFT]);
  });

  it('should not allow direct DRAFT → PUBLISHED', () => {
    expect(ENTRY_STATUS_TRANSITIONS[EntryStatus.DRAFT]).not.toContain(EntryStatus.PUBLISHED);
  });

  it('should have transitions defined for every status', () => {
    for (const status of Object.values(EntryStatus)) {
      expect(ENTRY_STATUS_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(ENTRY_STATUS_TRANSITIONS[status])).toBe(true);
    }
  });
});
