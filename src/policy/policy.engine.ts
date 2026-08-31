import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { POLICY_OPTIONS } from './constants';
import { AuthorizationContext, AuthorizationResult, PolicyModuleOptions } from './interfaces';
import { PolicyRegistry } from './policy.registry';

/**
 * PolicyEngine — evaluates authorization policies against a context.
 * Orchestrates: context building → policy lookup → evaluation → result.
 */
@Injectable()
export class PolicyEngine {
  private readonly logger = new Logger(PolicyEngine.name);

  constructor(
    private readonly registry: PolicyRegistry,
    @Optional() @Inject(POLICY_OPTIONS) private readonly options?: PolicyModuleOptions,
  ) {}

  /** Build AuthorizationContext from request */
  async buildContext(request: any, metadata?: Record<string, any>): Promise<AuthorizationContext> {
    if (this.options?.buildContext) {
      return this.options.buildContext(request, metadata);
    }
    const user = request.user ?? {};
    return {
      user: {
        id: user.sub ?? user.id ?? '',
        roles: user.roles ?? [],
        permissions: user.permissions ?? [],
        organizationId: user.organizationId,
        departmentId: user.departmentId,
        teamId: user.teamId,
      },
      action: metadata?.action ?? '',
      resource: metadata?.resource,
      resourceId: metadata?.resourceId ?? request.params?.id,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
      teamId: user.teamId,
      purposeOfUse: request.headers?.['x-purpose-of-use'] ?? request.body?.purposeOfUse,
      metadata,
    };
  }

  /** Evaluate a named policy */
  async evaluate(policyName: string, context: AuthorizationContext): Promise<AuthorizationResult> {
    const policy = this.registry.get(policyName);
    if (!policy) {
      this.logger.warn(`Policy "${policyName}" not found`);
      const denyByDefault = this.options?.denyByDefault ?? true;
      return {
        allowed: !denyByDefault,
        reason: `Policy "${policyName}" not registered`,
        policy: policyName,
      };
    }

    try {
      const result = await policy.evaluate(context);
      return { ...result, policy: policyName };
    } catch (error) {
      this.logger.error(`Policy "${policyName}" evaluation failed: ${error}`);
      return {
        allowed: false,
        reason: `Policy evaluation error: ${(error as Error).message}`,
        policy: policyName,
      };
    }
  }

  /** Evaluate multiple policies — ALL must allow (AND logic) */
  async evaluateAll(policyNames: string[], context: AuthorizationContext): Promise<AuthorizationResult> {
    for (const name of policyNames) {
      const result = await this.evaluate(name, context);
      if (!result.allowed) return result;
    }
    return { allowed: true, reason: 'All policies passed' };
  }
}
