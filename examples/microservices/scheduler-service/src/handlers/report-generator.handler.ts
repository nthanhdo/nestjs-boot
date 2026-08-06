import { Injectable, Logger } from '@nestjs/common';

/**
 * Example handler: generate a daily summary report.
 * In production, this would aggregate metrics and send/store a report.
 * Suggested cron: "0 8 * * *" (daily at 8am)
 */
@Injectable()
export class ReportGeneratorHandler {
  private readonly logger = new Logger(ReportGeneratorHandler.name);

  async execute(
    payload: Record<string, unknown>,
  ): Promise<{ reportId: string; generatedAt: string }> {
    this.logger.log(
      `[report-generator] Running with payload: ${JSON.stringify(payload)}`,
    );

    // Simulated report generation
    const reportId = `RPT-${Date.now()}`;
    const generatedAt = new Date().toISOString();

    this.logger.log(
      `[report-generator] Report ${reportId} generated at ${generatedAt}`,
    );

    return { reportId, generatedAt };
  }
}
