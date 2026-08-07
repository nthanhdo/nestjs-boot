export { ShutdownModule } from './shutdown.module';
export { ShutdownService, isKubernetesEnvironment, getK8sPreStopDelay } from './shutdown.service';
export { getK8sShutdownInfo } from './k8s-shutdown';
export { SHUTDOWN_OPTIONS, DEFAULT_SHUTDOWN_TIMEOUT, DEFAULT_SHUTDOWN_SIGNALS } from './constants';
export type { ShutdownOptions, DrainStrategy } from './interfaces';
