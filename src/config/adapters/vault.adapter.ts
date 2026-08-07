import { ConfigSource } from './config-source.interface';

export interface VaultAdapterOptions {
  /** Vault server URL (e.g., 'http://127.0.0.1:8200') */
  url: string;
  /** Vault token with read access to the target path */
  token: string;
  /** Secret path to read (e.g., 'secret/data/my-service') */
  path: string;
}

/**
 * VaultAdapter — loads secrets from HashiCorp Vault KV v2.
 *
 * Uses the Vault HTTP API directly (no SDK dependency).
 * Requires only Node.js built-in `https`/`http` — no extra packages needed.
 *
 * The path must point to a KV v2 secret. The `data` object in the response
 * is merged into the config.
 *
 * ```ts
 * const sources: ConfigSource[] = [
 *   new EnvFileAdapter('.env'),
 *   new VaultAdapter({
 *     url: 'http://vault.internal:8200',
 *     token: process.env.VAULT_TOKEN!,
 *     path: 'secret/data/my-service',
 *   }),
 * ];
 * const merged = await mergeConfigs(sources);
 * ```
 *
 * Token permissions required:
 * - `read` capability on the target path
 */
export class VaultAdapter implements ConfigSource {
  readonly name = 'vault';

  constructor(private readonly options: VaultAdapterOptions) {}

  async load(): Promise<Record<string, unknown>> {
    const url = `${this.options.url.replace(/\/$/, '')}/v1/${this.options.path.replace(/^\//, '')}`;

    const response = await this.httpGet(url, {
      'X-Vault-Token': this.options.token,
    });

    // KV v2 response shape: { data: { data: { KEY: VALUE, ... } } }
    const kvData = (response as any)?.data?.data;
    if (kvData && typeof kvData === 'object') {
      return kvData as Record<string, unknown>;
    }

    // KV v1 response shape: { data: { KEY: VALUE, ... } }
    const kv1Data = (response as any)?.data;
    if (kv1Data && typeof kv1Data === 'object') {
      return kv1Data as Record<string, unknown>;
    }

    return {};
  }

  private httpGet(url: string, headers: Record<string, string>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const mod = parsedUrl.protocol === 'https:' ? require('https') : require('http');

      const req = mod.get(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          headers,
        },
        (res: any) => {
          let body = '';
          res.on('data', (chunk: string) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(
                new Error(
                  `[nestjs-boot] VaultAdapter: HTTP ${res.statusCode} from Vault at "${url}".\n` +
                    `  Check the token and path. Body: ${body.slice(0, 200)}`,
                ),
              );
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(
                new Error(
                  `[nestjs-boot] VaultAdapter: Non-JSON response from Vault at "${url}".`,
                ),
              );
            }
          });
        },
      );

      req.on('error', (err: Error) => {
        reject(
          new Error(
            `[nestjs-boot] VaultAdapter: Cannot connect to Vault at "${url}".\n  Cause: ${err.message}`,
          ),
        );
      });
    });
  }
}
