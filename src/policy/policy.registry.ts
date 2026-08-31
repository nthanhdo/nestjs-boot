import { Injectable, Logger } from '@nestjs/common';
import { AuthorizationPolicy } from './interfaces';

/**
 * PolicyRegistry — manages named authorization policies.
 * Policies are registered at module init and looked up by name at runtime.
 */
@Injectable()
export class PolicyRegistry {
  private readonly logger = new Logger(PolicyRegistry.name);
  private readonly policies = new Map<string, AuthorizationPolicy>();

  register(policy: AuthorizationPolicy): void {
    if (this.policies.has(policy.name)) {
      this.logger.warn(`Policy "${policy.name}" is being overwritten`);
    }
    this.policies.set(policy.name, policy);
    this.logger.log(`Policy registered: ${policy.name}`);
  }

  get(name: string): AuthorizationPolicy | undefined {
    return this.policies.get(name);
  }

  has(name: string): boolean {
    return this.policies.has(name);
  }

  getAll(): AuthorizationPolicy[] {
    return [...this.policies.values()];
  }

  getNames(): string[] {
    return [...this.policies.keys()];
  }
}
