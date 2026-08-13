import { Logger } from '@nestjs/common';
import { BootOptions } from '../interfaces/boot-options.interface';

export type DeployPhase = 'preStart' | 'preMigrate' | 'postMigrate' | 'postStart' | 'healthGate';

export interface DeployContext {
  phase: DeployPhase;
  environment: string;
  version: string;
  startTime: Date;
  logger: Logger;
  config: BootOptions;
}

export interface DeployHook {
  name: string;
  phase: DeployPhase;
  order?: number;
  execute(context: DeployContext): Promise<void>;
}

export interface DeployOptions {
  enabled?: boolean;
  requiredEnvVars?: string[];
  dependencyCheck?: boolean;
  readinessDelay?: number;
  hooks?: DeployHook[];
}

export const DEPLOY_PHASE_ORDER: DeployPhase[] = [
  'preStart',
  'preMigrate',
  'postMigrate',
  'postStart',
  'healthGate',
];
