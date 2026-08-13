import { Injectable, Logger } from '@nestjs/common';
import { DeployHook, DeployPhase, DeployContext } from './interfaces';

@Injectable()
export class DeployService {
  private readonly logger = new Logger(DeployService.name);
  private readonly hooks: DeployHook[] = [];

  registerHook(hook: DeployHook): void {
    this.hooks.push(hook);
    this.logger.log(`Registered deploy hook "${hook.name}" for phase "${hook.phase}" (order: ${hook.order ?? 0})`);
  }

  async executePhase(phase: DeployPhase, context: DeployContext): Promise<void> {
    const phaseHooks = this.hooks
      .filter((h) => h.phase === phase)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (phaseHooks.length === 0) {
      this.logger.log(`Phase "${phase}": no hooks registered — skipping`);
      return;
    }

    this.logger.log(`Phase "${phase}": executing ${phaseHooks.length} hook(s)...`);
    const phaseStart = Date.now();

    for (const hook of phaseHooks) {
      const hookStart = Date.now();
      this.logger.log(`  [${hook.name}] starting...`);
      try {
        await hook.execute(context);
        const elapsed = Date.now() - hookStart;
        this.logger.log(`  [${hook.name}] completed in ${elapsed}ms`);
      } catch (error) {
        const elapsed = Date.now() - hookStart;
        this.logger.error(`  [${hook.name}] FAILED after ${elapsed}ms`, error);
        throw error;
      }
    }

    const totalElapsed = Date.now() - phaseStart;
    this.logger.log(`Phase "${phase}": completed in ${totalElapsed}ms`);
  }

  getHooks(): ReadonlyArray<DeployHook> {
    return [...this.hooks];
  }
}
