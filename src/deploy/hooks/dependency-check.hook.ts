import { DeployHook, DeployContext } from '../interfaces';

/**
 * Checks external dependency connectivity (MongoDB, Redis) before boot.
 */
export class DependencyCheckHook implements DeployHook {
  readonly name = 'DependencyCheck';
  readonly phase = 'preStart' as const;
  readonly order = -50;

  async execute(context: DeployContext): Promise<void> {
    const checks: string[] = [];

    // Check MongoDB connectivity
    if (context.config.database) {
      for (const [name, conn] of Object.entries(context.config.database.connections)) {
        try {
          const mongoose = require('mongoose');
          const testConn = await mongoose.createConnection(conn.writerUri).asPromise();
          await testConn.close();
          checks.push(`MongoDB/${name}: OK`);
        } catch (error: any) {
          throw new Error(`MongoDB/${name} connectivity check failed: ${error.message}`);
        }
      }
    }

    // Check Redis connectivity
    if (context.config.cache?.redis) {
      try {
        const Redis = require('ioredis');
        const redis = new Redis(context.config.cache.redis.url);
        await redis.ping();
        await redis.quit();
        checks.push('Redis: OK');
      } catch (error: any) {
        throw new Error(`Redis connectivity check failed: ${error.message}`);
      }
    }

    if (checks.length > 0) {
      context.logger.log(`Dependency checks passed: ${checks.join(', ')}`);
    } else {
      context.logger.log('No external dependencies configured — skipping checks');
    }
  }
}
