import { Injectable, Logger } from '@nestjs/common';

/**
 * Example handler: delete expired records.
 * In production, this would query collections for TTL-expired documents.
 * Suggested cron: "0 2 * * *" (every day at 2am)
 */
@Injectable()
export class CleanupExpiredHandler {
  private readonly logger = new Logger(CleanupExpiredHandler.name);

  async execute(payload: Record<string, unknown>): Promise<{ deleted: number }> {
    this.logger.log(
      `[cleanup-expired] Running with payload: ${JSON.stringify(payload)}`,
    );

    // Simulated cleanup — in production, delete expired sessions/tokens/etc.
    const deletedCount = Math.floor(Math.random() * 50);
    this.logger.log(`[cleanup-expired] Deleted ${deletedCount} expired records`);

    return { deleted: deletedCount };
  }
}
