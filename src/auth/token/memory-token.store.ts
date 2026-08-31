import { TokenStore } from './token-store.interface';

export class MemoryTokenStore implements TokenStore {
  private tokens = new Map<string, { familyId: string; userId: string; used: boolean; expiresAt: Date }>();
  private revokedFamilies = new Set<string>();

  async storeToken(tokenId: string, familyId: string, userId: string, expiresAt: Date): Promise<void> {
    this.tokens.set(tokenId, { familyId, userId, used: false, expiresAt });
  }

  async getToken(tokenId: string): Promise<{ familyId: string; userId: string; used: boolean } | null> {
    const t = this.tokens.get(tokenId);
    if (!t) return null;
    if (t.expiresAt < new Date()) { this.tokens.delete(tokenId); return null; }
    return { familyId: t.familyId, userId: t.userId, used: t.used };
  }

  async markUsed(tokenId: string): Promise<void> {
    const t = this.tokens.get(tokenId);
    if (t) t.used = true;
  }

  async revokeFamily(familyId: string): Promise<void> {
    this.revokedFamilies.add(familyId);
    for (const [id, t] of this.tokens) {
      if (t.familyId === familyId) this.tokens.delete(id);
    }
  }

  async isFamilyRevoked(familyId: string): Promise<boolean> {
    return this.revokedFamilies.has(familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const [id, t] of this.tokens) {
      if (t.userId === userId) {
        this.revokedFamilies.add(t.familyId);
        this.tokens.delete(id);
      }
    }
  }
}
