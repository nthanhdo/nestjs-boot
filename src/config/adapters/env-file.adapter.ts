import { ConfigSource } from './config-source.interface';

/**
 * EnvFileAdapter — loads key-value pairs from a `.env` file.
 *
 * Uses `dotenv` (optional peer dependency) to parse the file.
 * If `dotenv` is not installed, load() returns an empty object and logs a warning.
 *
 * ```ts
 * const sources: ConfigSource[] = [
 *   new EnvFileAdapter('.env'),
 *   new EnvFileAdapter('.env.production'),
 * ];
 * const merged = await mergeConfigs(sources);
 * ```
 */
export class EnvFileAdapter implements ConfigSource {
  readonly name = 'env-file';

  constructor(private readonly filePath: string) {}

  async load(): Promise<Record<string, unknown>> {
    let dotenv: { parse: (content: string) => Record<string, string> };
    try {
      dotenv = require('dotenv');
    } catch {
      process.stderr.write(
        `[nestjs-boot] EnvFileAdapter: dotenv is not installed. Cannot load "${this.filePath}".\n`,
      );
      return {};
    }

    let fs: { existsSync: (p: string) => boolean; readFileSync: (p: string, enc: string) => string };
    try {
      fs = require('fs');
    } catch {
      return {};
    }

    if (!fs.existsSync(this.filePath)) {
      return {};
    }

    const content = fs.readFileSync(this.filePath, 'utf-8') as string;
    return dotenv.parse(content);
  }
}
