import { Controller, Get, Res, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(@Inject(MetricsService) private readonly metricsService: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response) {
    const registry = this.metricsService.getRegistry();
    if (!registry) {
      res.status(503).send('# Metrics unavailable — prom-client not installed\n');
      return;
    }

    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  }
}
