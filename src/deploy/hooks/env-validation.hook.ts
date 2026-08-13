import { DeployHook, DeployContext } from '../interfaces';

/**
 * Validates that all required environment variables are set before boot.
 */
export class EnvValidationHook implements DeployHook {
  readonly name = 'EnvValidation';
  readonly phase = 'preStart' as const;
  readonly order = -100; // Run first

  constructor(private readonly requiredVars: string[]) {}

  async execute(context: DeployContext): Promise<void> {
    const missing = this.requiredVars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}`,
      );
    }
    context.logger.log(`All ${this.requiredVars.length} required env vars present`);
  }
}
