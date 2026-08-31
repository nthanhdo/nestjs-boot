import { SetMetadata } from '@nestjs/common';
import { POLICY_KEY } from './constants';

/**
 * @CheckPolicy('policyName') — invokes a named policy for authorization.
 * Can pass additional metadata for the policy context.
 *
 * @example
 * @CheckPolicy('canAccessResource')
 * @CheckPolicy('departmentAccess', { resource: 'report' })
 */
export const CheckPolicy = (policyName: string, metadata?: Record<string, any>) =>
  SetMetadata(POLICY_KEY, { policyName, metadata });
