import { SetMetadata } from '@nestjs/common';
import { SCOPE_KEY } from './constants';
import { AccessScope } from './interfaces';

/**
 * @RequireScope(AccessScope.DEPARTMENT) — route requires at least DEPARTMENT-level access.
 * User's resolved scope must be >= the required scope.
 */
export const RequireScope = (scope: AccessScope) => SetMetadata(SCOPE_KEY, scope);
