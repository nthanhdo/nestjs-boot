/**
 * Service Discovery Hook — optional dynamic URL resolution for transport clients.
 *
 * By default, `TransportModule` uses static URLs from the configuration object.
 * Implement `ServiceDiscoveryHook` to resolve URLs dynamically at module init
 * (and optionally on connection failure) from Consul, Kubernetes DNS, etcd,
 * an env-var lookup, or any other registry.
 *
 * ## No vendor lock-in
 * This is a plain interface — nestjs-boot ships no Consul/etcd/K8s client.
 * You provide the implementation; the framework calls `resolve()` at the right time.
 *
 * ## Usage
 *
 * ```ts
 * // Simple env-var resolution
 * class EnvDiscovery implements ServiceDiscoveryHook {
 *   constructor(private readonly envKey: string) {}
 *   async resolve(): Promise<{ url: string }> {
 *     const url = process.env[this.envKey];
 *     if (!url) throw new Error(`Missing env var: ${this.envKey}`);
 *     return { url };
 *   }
 * }
 *
 * // Consul-based resolution (you bring the consul client)
 * class ConsulDiscovery implements ServiceDiscoveryHook {
 *   constructor(private readonly consul: ConsulClient, private readonly svc: string) {}
 *   async resolve(): Promise<{ url: string }> {
 *     const address = await this.consul.resolve(this.svc);
 *     return { url: `http://${address}` };
 *   }
 * }
 *
 * // Wire in TransportModule config
 * TransportModule.register({
 *   clients: {
 *     ORDER_SERVICE: {
 *       transport: 'grpc',
 *       options: { package: 'order', protoPath: './order.proto' },
 *       discover: new ConsulDiscovery(consulClient, 'order-service'),
 *     },
 *   },
 * });
 * ```
 *
 * ## Resolution lifecycle
 *
 * 1. **Module init** — `resolve()` is called once per client before the first
 *    connection is established. The returned `url` overrides `options.url`.
 * 2. **Connection failure** (optional) — If `retryOnFailure: true` is set on
 *    the client options, `resolve()` is called again before each reconnect
 *    attempt. Useful when instances move (e.g. pod restarts in Kubernetes).
 *
 * ## Error handling
 *
 * If `resolve()` throws, module startup fails with a descriptive error that
 * includes the client name. This surfaces misconfiguration early (at startup)
 * rather than at the first call.
 */
export interface ServiceDiscoveryHook {
  /**
   * Resolve the current URL for this service.
   * Called at module init and, optionally, on connection failure.
   *
   * @returns An object with the resolved `url` string.
   * @throws If the service cannot be located, throw an `Error` — startup fails fast.
   */
  resolve(): Promise<{ url: string }>;
}

/**
 * Re-resolution policy — controls when `ServiceDiscoveryHook.resolve()` is
 * called after the initial module-init call.
 */
export interface ServiceDiscoveryPolicy {
  /**
   * Call `resolve()` again before each reconnect attempt after a connection
   * failure. Useful for dynamic environments where service addresses change.
   *
   * @default false
   */
  retryOnFailure?: boolean;

  /**
   * Maximum age of a resolved URL in milliseconds. After this duration,
   * `resolve()` is called proactively on the next call even if the connection
   * appears healthy. Useful for rolling deployments where the old instance
   * is deregistered after some time.
   *
   * Set to `0` to disable TTL-based re-resolution.
   *
   * @default 0 (disabled)
   */
  ttlMs?: number;
}

/**
 * Resolved discovery result — returned by `ServiceDiscoveryHook.resolve()`.
 */
export interface DiscoveryResult {
  /** Fully-qualified URL of the service (e.g. 'grpc://order-service:5000') */
  url: string;
}

/**
 * Utility: creates a `ServiceDiscoveryHook` from a plain async function.
 * Handy for one-liners without needing to implement the interface explicitly.
 *
 * ```ts
 * discover: fromResolverFn(async () => ({
 *   url: await dns.lookup('order-service.svc.cluster.local'),
 * }))
 * ```
 */
export function fromResolverFn(
  fn: () => Promise<DiscoveryResult>,
): ServiceDiscoveryHook {
  return { resolve: fn };
}

/**
 * Static discovery — always returns the same URL.
 * Equivalent to not using discovery at all, but useful when you want to keep
 * a consistent config shape across environments.
 *
 * ```ts
 * discover: staticUrl('grpc://order-service:5000')
 * ```
 */
export function staticUrl(url: string): ServiceDiscoveryHook {
  return {
    resolve: async () => ({ url }),
  };
}
