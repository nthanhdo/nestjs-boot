import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'AUDIT_ACTION';

/**
 * Mark a controller method for automatic success-path audit logging.
 * When present, AuditInterceptor will log an ALLOW entry after a successful response.
 *
 * @param action - The audit action name (e.g. 'user.create', 'order.export')
 */
export const Audited = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);
