export interface EventBusOptions {
  transport: 'memory' | 'redis';
  redis?: { url: string };
}

export interface OnEventOptions {
  async?: boolean;
}
