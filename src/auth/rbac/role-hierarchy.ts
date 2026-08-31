/**
 * Glob-style permission matching.
 * - `*` matches any permission.
 * - `user:*` matches `user:read`, `user:write`, etc.
 * - Exact match otherwise.
 */
export function matchesPermission(userPerm: string, required: string): boolean {
  if (userPerm === '*') return true;
  if (userPerm === required) return true;
  if (userPerm.endsWith(':*')) {
    const prefix = userPerm.slice(0, -1); // e.g. 'user:'
    return required.startsWith(prefix);
  }
  return false;
}

export interface RoleDefinition {
  name: string;
  inherits?: string[];
  permissions?: string[];
}

export class RoleHierarchy {
  private readonly roles = new Map<string, RoleDefinition>();

  constructor(definitions?: RoleDefinition[]) {
    if (definitions) {
      for (const def of definitions) {
        this.roles.set(def.name, def);
      }
    }
  }

  /** Register or update a role definition */
  define(definition: RoleDefinition): void {
    this.roles.set(definition.name, definition);
  }

  /** Get all effective roles for a user role (including inherited) */
  resolve(role: string): string[] {
    const resolved = new Set<string>();
    this._resolve(role, resolved);
    return [...resolved];
  }

  /** Get all effective roles for multiple user roles */
  resolveAll(roles: string[]): string[] {
    const resolved = new Set<string>();
    for (const role of roles) {
      this._resolve(role, resolved);
    }
    return [...resolved];
  }

  /** Get all permissions for a role (including inherited role permissions) */
  getPermissions(role: string): string[] {
    const perms = new Set<string>();
    const resolvedRoles = this.resolve(role);
    for (const r of resolvedRoles) {
      const def = this.roles.get(r);
      if (def?.permissions) {
        for (const p of def.permissions) perms.add(p);
      }
    }
    return [...perms];
  }

  /** Get all permissions for multiple roles */
  getAllPermissions(roles: string[]): string[] {
    const perms = new Set<string>();
    for (const role of roles) {
      for (const p of this.getPermissions(role)) {
        perms.add(p);
      }
    }
    return [...perms];
  }

  /** Check if hierarchy has a circular dependency */
  validate(): { valid: boolean; cycles: string[][] } {
    const cycles: string[][] = [];
    for (const [name] of this.roles) {
      const path: string[] = [];
      if (this._detectCycle(name, path, new Set())) {
        cycles.push([...path]);
      }
    }
    return { valid: cycles.length === 0, cycles };
  }

  private _resolve(role: string, resolved: Set<string>): void {
    if (resolved.has(role)) return; // prevent infinite loops
    resolved.add(role);
    const def = this.roles.get(role);
    if (def?.inherits) {
      for (const parent of def.inherits) {
        this._resolve(parent, resolved);
      }
    }
  }

  private _detectCycle(role: string, path: string[], visiting: Set<string>): boolean {
    if (visiting.has(role)) {
      path.push(role);
      return true;
    }
    visiting.add(role);
    path.push(role);
    const def = this.roles.get(role);
    if (def?.inherits) {
      for (const parent of def.inherits) {
        if (this._detectCycle(parent, path, new Set(visiting))) return true;
      }
    }
    path.pop();
    return false;
  }
}
