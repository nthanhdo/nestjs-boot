import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

/**
 * DbMetricsInterceptor — records query duration + total for DB operations.
 *
 * Metrics emitted:
 *   boot_db_query_duration_seconds{connection, operation}  — histogram
 *   boot_db_query_total{connection, operation, status}      — counter
 *
 * Usage (NestJS guard/interceptor on a resolver or controller):
 *   @UseInterceptors(DbMetricsInterceptor)
 *
 * For Mongoose plugin auto-instrumentation, call DbMetricsInterceptor.mongoosePlugin()
 * and pass the returned plugin to your Mongoose connection:
 *   mongoose.plugin(DbMetricsInterceptor.mongoosePlugin(metricsService));
 */
@Injectable()
export class DbMetricsInterceptor implements NestInterceptor {
  private readonly durationHistogram: any;
  private readonly queryCounter: any;

  constructor(@Inject(MetricsService) private readonly metricsService: MetricsService) {
    this.durationHistogram = this.metricsService.histogram(
      'boot_db_query_duration_seconds',
      'Duration of database queries in seconds',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      ['connection', 'operation'],
    );
    this.queryCounter = this.metricsService.counter(
      'boot_db_query_total',
      'Total number of database queries',
      ['connection', 'operation', 'status'],
    );
  }

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    // Generic interceptor path — records as "app" connection / "query" operation
    const dbConnection = 'default';
    const dbOperation = 'query';
    const end = this.durationHistogram.startTimer({ connection: dbConnection, operation: dbOperation });

    return next.handle().pipe(
      tap({
        next: () => {
          end();
          this.queryCounter.inc({ connection: dbConnection, operation: dbOperation, status: 'success' });
        },
        error: () => {
          end();
          this.queryCounter.inc({ connection: dbConnection, operation: dbOperation, status: 'error' });
        },
      }),
    );
  }

  /**
   * Record a DB operation manually (for use in service/repository layers).
   *
   * @param connection - connection identifier (e.g. 'mongodb', 'postgres')
   * @param operation  - operation type (e.g. 'find', 'insertOne', 'aggregate')
   * @param fn         - async function to wrap
   */
  async recordOperation<T>(connection: string, operation: string, fn: () => Promise<T>): Promise<T> {
    const end = this.durationHistogram.startTimer({ connection, operation });
    try {
      const result = await fn();
      end();
      this.queryCounter.inc({ connection, operation, status: 'success' });
      return result;
    } catch (err) {
      end();
      this.queryCounter.inc({ connection, operation, status: 'error' });
      throw err;
    }
  }

  /**
   * Mongoose plugin factory — auto-instruments all Mongoose queries via hooks.
   *
   * Usage:
   *   import mongoose from 'mongoose';
   *   const plugin = DbMetricsInterceptor.mongoosePlugin(metricsService);
   *   mongoose.plugin(plugin);
   *
   * Or per-schema:
   *   UserSchema.plugin(DbMetricsInterceptor.mongoosePlugin(metricsService));
   */
  static mongoosePlugin(metricsService: MetricsService): (schema: any) => void {
    const durationHistogram = metricsService.histogram(
      'boot_db_query_duration_seconds',
      'Duration of database queries in seconds',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      ['connection', 'operation'],
    );
    const queryCounter = metricsService.counter(
      'boot_db_query_total',
      'Total number of database queries',
      ['connection', 'operation', 'status'],
    );

    const QUERY_OPS = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'count', 'countDocuments', 'distinct'];
    const DOC_OPS = ['save', 'remove', 'deleteOne', 'validate'];

    return function mongooseMetricsPlugin(schema: any) {
      // Query middleware
      for (const op of QUERY_OPS) {
        schema.pre(op, function (this: any) {
          this._metricsStart = Date.now();
          this._metricsOp = op;
        });
        schema.post(op, function (this: any, _result: any) {
          if (this._metricsStart) {
            const duration = (Date.now() - this._metricsStart) / 1000;
            durationHistogram.observe({ connection: 'mongodb', operation: op }, duration);
            queryCounter.inc({ connection: 'mongodb', operation: op, status: 'success' });
          }
        });
        schema.post(op, function (this: any, err: any, _doc: any, next: any) {
          if (err && this._metricsStart) {
            const duration = (Date.now() - this._metricsStart) / 1000;
            durationHistogram.observe({ connection: 'mongodb', operation: op }, duration);
            queryCounter.inc({ connection: 'mongodb', operation: op, status: 'error' });
          }
          if (typeof next === 'function') next(err);
        });
      }

      // Document middleware
      for (const op of DOC_OPS) {
        schema.pre(op, function (this: any) {
          this._metricsStart = Date.now();
          this._metricsOp = op;
        });
        schema.post(op, function (this: any, _next: any) {
          if (this._metricsStart) {
            const duration = (Date.now() - this._metricsStart) / 1000;
            durationHistogram.observe({ connection: 'mongodb', operation: this._metricsOp ?? 'save' }, duration);
            queryCounter.inc({ connection: 'mongodb', operation: this._metricsOp ?? 'save', status: 'success' });
          }
        });
      }

      // Aggregate middleware
      schema.pre('aggregate', function (this: any) {
        this._metricsStart = Date.now();
      });
      schema.post('aggregate', function (this: any, _result: any) {
        if (this._metricsStart) {
          const duration = (Date.now() - this._metricsStart) / 1000;
          durationHistogram.observe({ connection: 'mongodb', operation: 'aggregate' }, duration);
          queryCounter.inc({ connection: 'mongodb', operation: 'aggregate', status: 'success' });
        }
      });
    };
  }
}
