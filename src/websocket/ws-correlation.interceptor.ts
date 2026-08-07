import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

interface WsContext {
  switchToWs(): {
    getClient(): { id?: string; nsp?: { name?: string } };
    getData<T>(): T;
  };
  getType(): string;
}

/** Counters per namespace for metrics */
const connectionCounters = new Map<string, number>();
const messageCounters = new Map<string, number>();

function incrementCounter(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * WebSocket correlation interceptor.
 * - Injects correlationId into every WebSocket event context
 * - Tracks connected clients per namespace
 * - Exposes Prometheus-style metrics: boot_ws_connections_total, boot_ws_messages_total
 */
@Injectable()
export class WsCorrelationInterceptor {
  private readonly logger = new Logger('WsCorrelationInterceptor');

  intercept(context: WsContext, next: { handle(): Observable<unknown> }): Observable<unknown> {
    if (context.getType() !== 'ws') {
      return next.handle();
    }

    const wsCtx = context.switchToWs();
    const client = wsCtx.getClient();
    const namespace = client?.nsp?.name ?? '/';
    const correlationId = randomUUID();

    incrementCounter(messageCounters, namespace);
    this.logger.debug(
      `[WS] correlationId=${correlationId} namespace=${namespace} clientId=${client?.id ?? 'unknown'}`,
    );

    return next.handle().pipe(
      tap({
        error: (err) =>
          this.logger.error(
            `[WS] error correlationId=${correlationId}: ${err instanceof Error ? err.message : String(err)}`,
          ),
      }),
    );
  }

  /** Track a new connection for namespace (called from gateway) */
  static trackConnection(namespace: string): void {
    incrementCounter(connectionCounters, namespace);
  }

  /** Track a disconnection for namespace (called from gateway) */
  static untrackConnection(namespace: string): void {
    const count = connectionCounters.get(namespace) ?? 0;
    connectionCounters.set(namespace, Math.max(0, count - 1));
  }

  /** Prometheus-style metrics snapshot */
  static getMetrics(): {
    boot_ws_connections_total: Record<string, number>;
    boot_ws_messages_total: Record<string, number>;
  } {
    return {
      boot_ws_connections_total: Object.fromEntries(connectionCounters),
      boot_ws_messages_total: Object.fromEntries(messageCounters),
    };
  }
}
