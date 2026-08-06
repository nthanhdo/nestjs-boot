export const CIRCUIT_BREAKER_OPTIONS = Symbol('CIRCUIT_BREAKER_OPTIONS');
export const TIMEOUT_KEY = 'nestjs-boot:timeout';
export const RESILIENCE_OPTIONS = Symbol('RESILIENCE_OPTIONS');

export const DEFAULT_FAILURE_THRESHOLD = 5;
export const DEFAULT_RESET_TIMEOUT = 30_000;
export const DEFAULT_HALF_OPEN_MAX = 1;
export const DEFAULT_TIMEOUT = 30_000;

export const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_DELAY = 1_000;
export const DEFAULT_RETRY_MAX_DELAY = 10_000;
