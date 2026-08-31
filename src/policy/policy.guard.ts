import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { POLICY_KEY } from './constants';
import { PolicyEngine } from './policy.engine';

const IS_PUBLIC_KEY = 'boot:isPublic';

/**
 * PolicyGuard — invokes the named policy from @CheckPolicy() decorator.
 */
@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policyEngine: PolicyEngine,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const policyMeta = this.reflector.getAllAndOverride<{ policyName: string; metadata?: Record<string, any> }>(
      POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policyMeta) return true;

    const request = context.switchToHttp().getRequest();
    const authContext = await this.policyEngine.buildContext(request, policyMeta.metadata);
    const result = await this.policyEngine.evaluate(policyMeta.policyName, authContext);

    if (!result.allowed) {
      throw new ForbiddenException(result.reason ?? 'Policy denied access');
    }

    return true;
  }
}
