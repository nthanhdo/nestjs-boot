import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { METRICS_OPTIONS } from './constants';
import { MetricsOptions } from './interfaces';

let promClient: typeof import('prom-client') | undefined;
try {
  promClient = require('prom-client');
} catch {
  // prom-client not installed — MetricsService will be a no-op
}

/**
 * No-op metric stubs for when prom-client is not installed.
 */
const noopMetric = {
  inc: () => {},
  dec: () => {},
  set: () => {},
  observe: () => {},
  labels: () => noopMetric,
  startTimer: () => () => {},
  reset: () => {},
  remove: () => {},
};

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry: InstanceType<typeof import('prom-client').Registry> | undefined;
  private readonly prefix: string;
  private readonly metricsMap = new Map<string, unknown>();

  constructor(@Inject(METRICS_OPTIONS) private readonly options: MetricsOptions) {
    this.prefix = options.prefix ?? '';

    if (promClient) {
      this.registry = new promClient.Registry();
      if (this.prefix) {
        this.registry.setDefaultLabels({ service: this.prefix.replace(/_$/, '') });
      }
    }
  }

  onModuleInit() {
    if (!promClient || !this.registry) {
      this.logger.warn('prom-client not installed — metrics disabled (install: npm i prom-client)');
      return;
    }

    if (this.options.defaultMetrics !== false) {
      promClient.collectDefaultMetrics({ register: this.registry, prefix: this.prefix });
    }
  }

  /**
   * Get the underlying prom-client Registry (or undefined if not available).
   */
  getRegistry() {
    return this.registry;
  }

  /**
   * Create or get a Counter metric.
   */
  counter(name: string, help: string, labelNames?: string[]): any {
    const prefixedName = this.prefix + name;
    if (this.metricsMap.has(prefixedName)) {
      return this.metricsMap.get(prefixedName);
    }

    if (!promClient || !this.registry) {
      this.metricsMap.set(prefixedName, noopMetric);
      return noopMetric;
    }

    const counter = new promClient.Counter({
      name: prefixedName,
      help,
      labelNames: labelNames ?? [],
      registers: [this.registry],
    });
    this.metricsMap.set(prefixedName, counter);
    return counter;
  }

  /**
   * Create or get a Histogram metric.
   */
  histogram(name: string, help: string, buckets?: number[], labelNames?: string[]): any {
    const prefixedName = this.prefix + name;
    if (this.metricsMap.has(prefixedName)) {
      return this.metricsMap.get(prefixedName);
    }

    if (!promClient || !this.registry) {
      this.metricsMap.set(prefixedName, noopMetric);
      return noopMetric;
    }

    const histogram = new promClient.Histogram({
      name: prefixedName,
      help,
      buckets,
      labelNames: labelNames ?? [],
      registers: [this.registry],
    });
    this.metricsMap.set(prefixedName, histogram);
    return histogram;
  }

  /**
   * Create or get a Gauge metric.
   */
  gauge(name: string, help: string, labelNames?: string[]): any {
    const prefixedName = this.prefix + name;
    if (this.metricsMap.has(prefixedName)) {
      return this.metricsMap.get(prefixedName);
    }

    if (!promClient || !this.registry) {
      this.metricsMap.set(prefixedName, noopMetric);
      return noopMetric;
    }

    const gauge = new promClient.Gauge({
      name: prefixedName,
      help,
      labelNames: labelNames ?? [],
      registers: [this.registry],
    });
    this.metricsMap.set(prefixedName, gauge);
    return gauge;
  }
}
