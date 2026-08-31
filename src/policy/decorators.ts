import { SetMetadata } from '@nestjs/common';
import { POLICY_KEY } from './constants';

/**
 * @CheckPolicy('policyName') — invokes a named policy for authorization.
 * @CheckPolicy(['policy1', 'policy2']) — invokes multiple policies (all must pass).
 * Can pass additional metadata for the policy context.
 *
 * @example
 * @CheckPolicy('canAccessResource')
 * @CheckPolicy(['ownership', 'orgBoundary'], { resource: 'report' })
 */
export const CheckPolicy = (nameOrNames: string | string[], metadata?: Record<string, any>) => {
  const policyNames = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
  return SetMetadata(POLICY_KEY, { policyNames, metadata });
};
