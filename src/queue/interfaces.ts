export interface QueueOptions {
  driver: 'bullmq';
  redis: { url: string };
  defaultOptions?: {
    attempts?: number;
    backoff?: { type: 'exponential' | 'fixed'; delay: number };
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  };
}
