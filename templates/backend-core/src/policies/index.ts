export { OwnershipPolicy } from './ownership.policy';
export { DepartmentAccessPolicy } from './department-access.policy';
export { OrgBoundaryPolicy } from './org-boundary.policy';

import { OwnershipPolicy } from './ownership.policy';
import { DepartmentAccessPolicy } from './department-access.policy';
import { OrgBoundaryPolicy } from './org-boundary.policy';

/**
 * Pre-constructed instances of all built-in authorization policies.
 *
 * Pass to `PolicyModule.forRoot({ policies: BUILT_IN_POLICIES })` or merge
 * with your application-specific policies.
 *
 * Evaluation order matters — policies are evaluated in array order.
 * OrgBoundary runs first (broadest gate), then DepartmentAccess (narrower),
 * then Ownership (narrowest). Adjust order to suit your access model.
 */
export const BUILT_IN_POLICIES = [
  new OrgBoundaryPolicy(),
  new DepartmentAccessPolicy(),
  new OwnershipPolicy(),
];
