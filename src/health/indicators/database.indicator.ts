import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import mongoose from 'mongoose';
import { DatabaseOptions } from '../../interfaces/boot-options.interface';
import { getWriterConnectionName } from '../../database/constants';

/**
 * Database health indicator — checks Mongoose connection readyState per connection.
 */
@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private readonly dbOptions: DatabaseOptions) {
    super();
  }

  async isHealthy(key = 'database'): Promise<HealthIndicatorResult> {
    const details: Record<string, { status: string }> = {};
    let isUp = true;

    for (const name of Object.keys(this.dbOptions.connections)) {
      const connName = getWriterConnectionName(name);
      const conn = mongoose.connections.find((c) => c.name === connName);
      const ready = conn?.readyState === 1;

      details[name] = { status: ready ? 'up' : 'down' };
      if (!ready) isUp = false;
    }

    const result = this.getStatus(key, isUp, details);
    if (!isUp) {
      throw new HealthCheckError('Database check failed', result);
    }
    return result;
  }
}
