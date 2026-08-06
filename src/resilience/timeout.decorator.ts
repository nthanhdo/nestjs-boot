import { SetMetadata } from '@nestjs/common';
import { TIMEOUT_KEY } from './constants';

/**
 * Sets a per-route timeout in milliseconds.
 * Overrides the global default when used with TimeoutInterceptor.
 */
export const Timeout = (ms: number) => SetMetadata(TIMEOUT_KEY, ms);
