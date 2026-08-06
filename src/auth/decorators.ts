import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY, PERMISSIONS_KEY, IS_PUBLIC_KEY } from './constants';

/**
 * @Roles('admin', 'manager') — route requires ANY of these roles.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * @Permissions('product:read', 'product:write') — route requires ALL of these permissions.
 */
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * @Public() — skip all auth guards on this route.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
