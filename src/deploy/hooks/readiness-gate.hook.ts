import { DeployHook, DeployContext } from '../interfaces';

/**
 * Polls the app health endpoint until it returns healthy,
 * then marks the service as ready (for K8s rolling deploy).
 */
export class ReadinessGateHook implements DeployHook {
  readonly name = 'ReadinessGate';
  readonly phase = 'healthGate' as const;
  readonly order = 0;

  private readonly maxAttempts: number;
  private readonly intervalMs: number;
  private readonly delayMs: number;

  constructor(options?: { maxAttempts?: number; intervalMs?: number; delayMs?: number }) {
    this.maxAttempts = options?.maxAttempts ?? 30;
    this.intervalMs = options?.intervalMs ?? 1000;
    this.delayMs = options?.delayMs ?? 0;
  }

  async execute(context: DeployContext): Promise<void> {
    if (this.delayMs > 0) {
      context.logger.log(`Readiness gate: waiting ${this.delayMs}ms before health check...`);
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    const healthPath = (context.config.health as any)?.path || '/health';
    context.logger.log(`Readiness gate: polling ${healthPath} (max ${this.maxAttempts} attempts, ${this.intervalMs}ms interval)`);

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const http = require('http');
        const port = process.env.PORT || 3000;
        const result = await new Promise<number>((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${port}${healthPath}`, (res: any) => {
            resolve(res.statusCode);
          });
          req.on('error', reject);
          req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Health check timeout'));
          });
        });

        if (result >= 200 && result < 300) {
          context.logger.log(`Readiness gate: healthy on attempt ${attempt}`);
          return;
        }
        context.logger.warn(`Readiness gate: attempt ${attempt} returned ${result}`);
      } catch {
        context.logger.warn(`Readiness gate: attempt ${attempt} failed`);
      }

      if (attempt < this.maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
      }
    }

    throw new Error(`Readiness gate: health check failed after ${this.maxAttempts} attempts`);
  }
}
