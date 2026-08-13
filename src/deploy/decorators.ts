import { DeployPhase } from './interfaces';
import 'reflect-metadata';

export const DEPLOY_HOOK_METADATA = 'DEPLOY_HOOK_METADATA';

export interface DeployHookMetadata {
  phase: DeployPhase;
  order: number;
  methodName: string | symbol;
}

/**
 * Marks a method as a deploy lifecycle hook.
 * Stores metadata on the class prototype (compatible with esbuild).
 *
 * @param phase - The deploy phase this hook runs in
 * @param order - Execution order within the phase (default: 0)
 */
export function OnDeploy(phase: DeployPhase, order = 0): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const existing: DeployHookMetadata[] =
      Reflect.getMetadata(DEPLOY_HOOK_METADATA, target) ?? [];
    existing.push({ phase, order, methodName: propertyKey });
    Reflect.defineMetadata(DEPLOY_HOOK_METADATA, existing, target);
    return descriptor;
  };
}
