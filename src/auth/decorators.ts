import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
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

/**
 * @CurrentUser() — extract the full user object from request.user (set by JwtAuthGuard).
 * @CurrentUser('id') — extract a specific field from request.user.
 *
 * ```ts
 * @Get('profile')
 * getProfile(@CurrentUser() user: UserPayload) { ... }
 *
 * @Get('profile')
 * getProfile(@CurrentUser('id') userId: string) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return field ? user?.[field] : user;
  },
);
