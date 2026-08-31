export interface TokenStore {
  /** Store a refresh token with its family ID */
  storeToken(tokenId: string, familyId: string, userId: string, expiresAt: Date): Promise<void>;
  /** Get token data by token ID */
  getToken(tokenId: string): Promise<{ familyId: string; userId: string; used: boolean } | null>;
  /** Mark a token as used */
  markUsed(tokenId: string): Promise<void>;
  /** Revoke all tokens in a family (reuse detected) */
  revokeFamily(familyId: string): Promise<void>;
  /** Check if a token family is revoked */
  isFamilyRevoked(familyId: string): Promise<boolean>;
  /** Revoke all tokens for a user */
  revokeAllForUser(userId: string): Promise<void>;
}

export const TOKEN_STORE = 'BOOT_TOKEN_STORE';
