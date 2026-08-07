export interface EventBusOptions {
  transport: 'memory' | 'redis';
  redis?: { url: string };
}

export interface OnEventOptions {
  async?: boolean;
}

export interface EmitAndWaitOptions {
  /** Timeout in milliseconds. Default: 5000 */
  timeout?: number;
}
