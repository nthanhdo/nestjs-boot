import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryTokenStore } from '../../src/auth/token/memory-token.store';

describe('MemoryTokenStore', () => {
  let store: MemoryTokenStore;

  beforeEach(() => {
    store = new MemoryTokenStore();
  });

  it('stores and retrieves a token', async () => {
    const exp = new Date(Date.now() + 60_000);
    await store.storeToken('tid1', 'fam1', 'user1', exp);
    const t = await store.getToken('tid1');
    expect(t).not.toBeNull();
    expect(t!.familyId).toBe('fam1');
    expect(t!.userId).toBe('user1');
    expect(t!.used).toBe(false);
  });

  it('returns null for unknown token', async () => {
    const t = await store.getToken('nonexistent');
    expect(t).toBeNull();
  });

  it('returns null for expired token', async () => {
    const exp = new Date(Date.now() - 1000); // already expired
    await store.storeToken('expired', 'fam2', 'user1', exp);
    const t = await store.getToken('expired');
    expect(t).toBeNull();
  });

  it('markUsed sets used = true', async () => {
    const exp = new Date(Date.now() + 60_000);
    await store.storeToken('tid2', 'fam3', 'user2', exp);
    await store.markUsed('tid2');
    const t = await store.getToken('tid2');
    expect(t!.used).toBe(true);
  });

  it('revokeFamily prevents retrieval of family tokens', async () => {
    const exp = new Date(Date.now() + 60_000);
    await store.storeToken('tid3', 'fam4', 'user3', exp);
    await store.revokeFamily('fam4');
    const t = await store.getToken('tid3');
    expect(t).toBeNull();
  });

  it('isFamilyRevoked returns true after revokeFamily', async () => {
    await store.revokeFamily('famX');
    expect(await store.isFamilyRevoked('famX')).toBe(true);
  });

  it('isFamilyRevoked returns false for unknown family', async () => {
    expect(await store.isFamilyRevoked('famUnknown')).toBe(false);
  });

  it('revokeAllForUser removes all user tokens', async () => {
    const exp = new Date(Date.now() + 60_000);
    await store.storeToken('ta', 'famA', 'userZ', exp);
    await store.storeToken('tb', 'famB', 'userZ', exp);
    await store.storeToken('tc', 'famC', 'otherUser', exp);
    await store.revokeAllForUser('userZ');
    expect(await store.getToken('ta')).toBeNull();
    expect(await store.getToken('tb')).toBeNull();
    // other user's token should still exist
    expect(await store.getToken('tc')).not.toBeNull();
  });

  it('revokeAllForUser marks families as revoked', async () => {
    const exp = new Date(Date.now() + 60_000);
    await store.storeToken('td', 'famD', 'userY', exp);
    await store.revokeAllForUser('userY');
    expect(await store.isFamilyRevoked('famD')).toBe(true);
  });
});
