import { ConfigSource } from './config-source.interface';

export interface AwsSecretsAdapterOptions {
  /** ARN or name of the AWS Secrets Manager secret */
  secretId: string;
  /** AWS region (e.g., 'us-east-1') */
  region: string;
}

/**
 * AwsSecretsAdapter — loads secrets from AWS Secrets Manager.
 *
 * Requires `@aws-sdk/client-secrets-manager` as an optional peer dependency.
 * If not installed, throws with a clear installation message.
 *
 * The secret value must be a JSON string (key-value object).
 * Each key in the secret is merged into the config.
 *
 * ```ts
 * const sources: ConfigSource[] = [
 *   new EnvFileAdapter('.env'),
 *   new AwsSecretsAdapter({ secretId: 'my-service/prod', region: 'us-east-1' }),
 * ];
 * // AWS secrets override .env values (higher priority)
 * const merged = await mergeConfigs(sources);
 * ```
 *
 * IAM permissions required:
 * - `secretsmanager:GetSecretValue` on the target secret ARN
 */
export class AwsSecretsAdapter implements ConfigSource {
  readonly name = 'aws-secrets';

  constructor(private readonly options: AwsSecretsAdapterOptions) {}

  async load(): Promise<Record<string, unknown>> {
    let SecretsManagerClient: any;
    let GetSecretValueCommand: any;

    try {
      const mod = require('@aws-sdk/client-secrets-manager');
      SecretsManagerClient = mod.SecretsManagerClient;
      GetSecretValueCommand = mod.GetSecretValueCommand;
    } catch {
      throw new Error(
        `[nestjs-boot] AwsSecretsAdapter requires "@aws-sdk/client-secrets-manager".\n` +
          `  Install it: npm install @aws-sdk/client-secrets-manager\n` +
          `  Secret: ${this.options.secretId} | Region: ${this.options.region}`,
      );
    }

    const client = new SecretsManagerClient({ region: this.options.region });

    let secretString: string;
    try {
      const response = await client.send(
        new GetSecretValueCommand({ SecretId: this.options.secretId }),
      );
      secretString = response.SecretString;
    } catch (err: any) {
      throw new Error(
        `[nestjs-boot] AwsSecretsAdapter: Failed to load secret "${this.options.secretId}" ` +
          `from region "${this.options.region}".\n  Cause: ${err?.message ?? String(err)}`,
      );
    }

    if (!secretString) {
      return {};
    }

    try {
      return JSON.parse(secretString) as Record<string, unknown>;
    } catch {
      throw new Error(
        `[nestjs-boot] AwsSecretsAdapter: Secret "${this.options.secretId}" is not valid JSON. ` +
          `Expected a JSON object with key-value pairs.`,
      );
    }
  }
}
