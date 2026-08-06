import { SetMetadata } from '@nestjs/common';
import {
  PROCESSOR_METADATA,
  PROCESS_METADATA,
  ON_FAILED_METADATA,
  ON_COMPLETED_METADATA,
} from './constants';

/**
 * Marks a class as a queue processor for the given queue name.
 */
export function Processor(queueName: string): ClassDecorator {
  return SetMetadata(PROCESSOR_METADATA, queueName);
}

/**
 * Marks a method as a job handler. If jobName is provided, only handles jobs with that name.
 */
export function Process(jobName?: string): MethodDecorator {
  return SetMetadata(PROCESS_METADATA, jobName ?? '*');
}

/**
 * Marks a method as a failed-job handler (DLQ pattern).
 */
export function OnFailed(): MethodDecorator {
  return SetMetadata(ON_FAILED_METADATA, true);
}

/**
 * Marks a method as a completed-job handler.
 */
export function OnCompleted(): MethodDecorator {
  return SetMetadata(ON_COMPLETED_METADATA, true);
}
