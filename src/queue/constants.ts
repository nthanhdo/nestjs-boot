/**
 * Injection token for queue options.
 */
export const QUEUE_OPTIONS = 'BOOT_QUEUE_OPTIONS';

/**
 * Injection token prefix for named queues.
 */
export const QUEUE_PREFIX = 'BOOT_QUEUE_';

/**
 * Metadata key for @Processor decorator.
 */
export const PROCESSOR_METADATA = 'BOOT_PROCESSOR_QUEUE';

/**
 * Metadata key for @Process decorator.
 */
export const PROCESS_METADATA = 'BOOT_PROCESS_JOB';

/**
 * Metadata key for @OnFailed decorator.
 */
export const ON_FAILED_METADATA = 'BOOT_ON_FAILED';

/**
 * Metadata key for @OnCompleted decorator.
 */
export const ON_COMPLETED_METADATA = 'BOOT_ON_COMPLETED';
