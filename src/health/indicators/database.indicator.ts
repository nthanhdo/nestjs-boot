import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, HealthIndicatorResult } from '@nestjs/terminus';
import mongoose from 'mongoose';
import { DatabaseOptions } from '../../interfaces/boot-options.interface';
import { getWriterConnectionName } from '../../database/constants';

/**
 * Database health indicator — checks Mongoose connection readyState per connection.
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly dbOptions: DatabaseOptions,
    private readonly indicator: HealthIndicatorService,
  ) {}

  async isHealthy(key = 'database'): Promise<HealthIndicatorResult> {
    const details: Record<string, string> = {};
    let allUp = true;

    for (const name of Object.keys(this.dbOptions.connections)) {
      const connName = getWriterConnectionName(name);
      const conn = mongoose.connections.find((c) => c.name === connName);
      const ready = conn?.readyState === 1;
      details[name] = ready ? 'up' : 'down';
      if (!ready) allUp = false;
    }

    const session = this.indicator.check(key);
    if (allUp) {
      return session.up(details);
    }
    return session.down(details);
  }
}
