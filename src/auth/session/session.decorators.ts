import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @Session() — extract session data from request.session (set by SessionGuard).
 * @Session('userId') — extract a specific field from session.
 */
export const Session = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const session = request.session;
    return field ? session?.[field] : session;
  },
);
