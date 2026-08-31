import { Injectable, ForbiddenException } from '@nestjs/common';

export interface LeveledRole {
  name: string;
  level: number;
  inherits?: string[];
  permissions?: string[];
}

/**
 * PrivilegeBoundary — enforces that users cannot assign roles/permissions
 * that exceed their own authority level.
 */
@Injectable()
export class PrivilegeBoundary {
  private readonly roles = new Map<string, LeveledRole>();

  constructor(definitions?: LeveledRole[]) {
    if (definitions) {
      for (const def of definitions) {
        this.roles.set(def.name, def);
      }
    }
  }

  /** Register or update a leveled role */
  define(role: LeveledRole): void {
    this.roles.set(role.name, role);
  }

  /** Get role level. Unknown roles default to 0. */
  getLevel(roleName: string): number {
    return this.roles.get(roleName)?.level ?? 0;
  }

  /** Get the highest level among a list of roles */
  getMaxLevel(roleNames: string[]): number {
    return Math.max(0, ...roleNames.map((r) => this.getLevel(r)));
  }

  /**
   * Check if actor can assign a target role.
   * Actor's max level must be strictly greater than target role level.
   */
  canAssignRole(actorRoles: string[], targetRole: string): boolean {
    const actorLevel = this.getMaxLevel(actorRoles);
    const targetLevel = this.getLevel(targetRole);
    return actorLevel > targetLevel;
  }

  /**
   * Enforce role assignment — throws ForbiddenException if not allowed.
   */
  enforceAssignment(actorRoles: string[], targetRole: string): void {
    if (!this.canAssignRole(actorRoles, targetRole)) {
      const actorLevel = this.getMaxLevel(actorRoles);
      const targetLevel = this.getLevel(targetRole);
      throw new ForbiddenException(
        `Privilege boundary: cannot assign role "${targetRole}" (level ${targetLevel}) — actor level is ${actorLevel}`,
      );
    }
  }

  /**
   * Check if actor can modify a target user's roles.
   * Actor must have higher level than ALL of target's current roles.
   */
  canModifyUser(actorRoles: string[], targetUserRoles: string[]): boolean {
    const actorLevel = this.getMaxLevel(actorRoles);
    const targetLevel = this.getMaxLevel(targetUserRoles);
    return actorLevel > targetLevel;
  }

  /**
   * Enforce user modification — throws if actor level <= target level.
   */
  enforceModification(actorRoles: string[], targetUserRoles: string[]): void {
    if (!this.canModifyUser(actorRoles, targetUserRoles)) {
      throw new ForbiddenException(
        'Privilege boundary: cannot modify user with equal or higher privilege level',
      );
    }
  }

  /** Get all defined leveled roles, sorted by level descending */
  getAllRoles(): LeveledRole[] {
    return [...this.roles.values()].sort((a, b) => b.level - a.level);
  }
}
