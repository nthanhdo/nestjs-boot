import { SetMetadata } from '@nestjs/common';

export const BREAK_GLASS_KEY = 'boot:breakGlass';

/**
 * @BreakGlass() — marks a route as emergency-accessible.
 * When a user has BREAK_GLASS permission AND provides an X-Break-Glass-Reason header,
 * scope/policy guards are bypassed and the access is logged at CRITICAL severity.
 */
export const BreakGlass = () => SetMetadata(BREAK_GLASS_KEY, true);
