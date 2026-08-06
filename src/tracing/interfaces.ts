export interface TracingOptions {
  /** Enable tracing (default: true if tracing config provided) */
  enabled?: boolean;
  /** Exporter type */
  exporter: 'otlp' | 'jaeger' | 'zipkin' | 'console';
  /** Exporter endpoint URL (required for otlp/jaeger/zipkin) */
  endpoint?: string;
  /** Service name for traces (default: reads from package.json name) */
  serviceName?: string;
  /** Sample rate 0.0–1.0 (default: 1.0 in dev, 0.1 in prod) */
  sampleRate?: number;
}
