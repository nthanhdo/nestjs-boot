/**
 * K8s-aware shutdown utilities for nestjs-boot.
 *
 * Kubernetes sends SIGTERM to the pod when it should shut down.
 * Before SIGTERM arrives, K8s calls the `preStop` lifecycle hook — this gives the
 * load balancer time to remove the pod from the service endpoint before connections
 * are terminated (typical iptables propagation lag: 1–5s).
 *
 * Recommended deployment.yaml lifecycle:
 * ```yaml
 * lifecycle:
 *   preStop:
 *     exec:
 *       command: ["sh", "-c", "sleep 5"]
 * ```
 *
 * And in your nestjs-boot config:
 * ```ts
 * shutdown: {
 *   timeout: 25000,   // 25s — 5s buffer before K8s terminationGracePeriodSeconds (30s default)
 *   drainStrategy: 'drain',
 * }
 * ```
 *
 * Set `terminationGracePeriodSeconds: 35` in your deployment to give the full
 * 5s preStop + 25s drain + 5s buffer before SIGKILL.
 */

/**
 * Detects whether the current process is running inside Kubernetes.
 * K8s injects KUBERNETES_SERVICE_HOST into every pod's environment.
 */
export function isKubernetesEnvironment(): boolean {
  return typeof process.env.KUBERNETES_SERVICE_HOST === 'string' &&
    process.env.KUBERNETES_SERVICE_HOST.length > 0;
}

/**
 * Returns the configured preStop delay in milliseconds.
 *
 * Reads `BOOT_PRESTOP_DELAY_MS` env var — set this to match your
 * `lifecycle.preStop: sleep N` value in deployment.yaml.
 *
 * Defaults to 5000 (5 seconds).
 */
export function getK8sPreStopDelay(): number {
  const raw = process.env.BOOT_PRESTOP_DELAY_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return isNaN(parsed) ? 5_000 : parsed;
}

/**
 * Returns K8s shutdown configuration summary for logging.
 * Call at app startup to surface K8s-aware config.
 */
export function getK8sShutdownInfo(): {
  isK8s: boolean;
  preStopDelay: number;
  message: string;
} {
  const isK8s = isKubernetesEnvironment();
  const preStopDelay = getK8sPreStopDelay();

  return {
    isK8s,
    preStopDelay,
    message: isK8s
      ? `K8s detected — preStop delay: ${preStopDelay}ms. ` +
        `Ensure deployment.yaml lifecycle.preStop matches (sleep ${Math.ceil(preStopDelay / 1000)}).`
      : 'Non-K8s environment — standard graceful shutdown.',
  };
}
