import { INestApplication, Type } from '@nestjs/common';
import { LAYER_KEY, ModuleLayer } from './layer.decorator';
import { LayerOptions } from './layer-config';

export interface LayerViolation {
  module: string;
  moduleLayer: ModuleLayer;
  importedModule: string;
  importedLayer: ModuleLayer;
  message: string;
}

export interface LayerValidationResult {
  valid: boolean;
  violations: LayerViolation[];
}

/** Known nestjs-boot core module names — auto-assigned CORE layer */
const CORE_MODULE_NAMES = new Set([
  'BootConfigModule',
  'DatabaseModule',
  'CacheModule',
  'HealthModule',
  'AuthModule',
  'CorrelationModule',
  'ShutdownModule',
  'TransportModule',
  'InterServiceAuthModule',
  'RpcModule',
  'MetricsModule',
  'LoggingModule',
  'TracingModule',
  'QueueModule',
  'EventBusModule',
  'BootWrappedModule',
]);

function getModuleName(metatype: Type<unknown>): string {
  return metatype.name;
}

function getLayerForModule(metatype: Type<unknown>): ModuleLayer {
  const name = getModuleName(metatype);

  // nestjs-boot's own modules are always CORE
  if (CORE_MODULE_NAMES.has(name)) {
    return ModuleLayer.CORE;
  }

  // Check @Layer decorator metadata
  const layer = Reflect.getMetadata(LAYER_KEY, metatype);
  if (layer !== undefined) {
    return layer as ModuleLayer;
  }

  // Default: DOMAIN (most common user module layer)
  return ModuleLayer.DOMAIN;
}

function layerName(layer: ModuleLayer): string {
  return ModuleLayer[layer] ?? `CUSTOM(${layer})`;
}

/**
 * Validates module layer rules after NestJS app boots.
 * Logs warnings (or throws in strict mode) for upward imports.
 *
 * Usage:
 *   validateLayers(app);                       // warn only
 *   validateLayers(app, { strict: true });     // throws on violation
 */
export function validateLayers(
  app: INestApplication,
  options?: LayerOptions,
): LayerValidationResult {
  const violations: LayerViolation[] = [];
  const allowSet = new Set(
    (options?.customRules?.allow ?? []).map((r) => `${r.from}→${r.to}`),
  );

  // Access NestJS internal container
  const container = (app as any).container;
  if (!container) {
    return { valid: true, violations: [] };
  }

  const modulesMap: Map<string, any> =
    container.getModules?.() ?? new Map();

  for (const [, moduleWrapper] of modulesMap) {
    const metatype: Type<unknown> | undefined = moduleWrapper.metatype;
    if (!metatype) continue;

    const moduleName = getModuleName(metatype);
    const moduleLayer = getLayerForModule(metatype);

    // Check each import
    const imports: Map<string, any> = moduleWrapper.imports ?? new Map();
    for (const [, importedWrapper] of imports) {
      const importedMeta: Type<unknown> | undefined = importedWrapper.metatype;
      if (!importedMeta) continue;

      const importedName = getModuleName(importedMeta);
      const importedLayer = getLayerForModule(importedMeta);

      // Violation: importing a module from a HIGHER layer
      if (importedLayer > moduleLayer) {
        const key = `${moduleName}→${importedName}`;
        if (allowSet.has(key)) continue;

        violations.push({
          module: moduleName,
          moduleLayer,
          importedModule: importedName,
          importedLayer,
          message: `${moduleName} (${layerName(moduleLayer)}, L${moduleLayer}) imports ${importedName} (${layerName(importedLayer)}, L${importedLayer}) — upward dependency`,
        });
      }
    }
  }

  const result: LayerValidationResult = {
    valid: violations.length === 0,
    violations,
  };

  // Log or throw
  if (violations.length > 0) {
    const { Logger } = require('@nestjs/common');
    const logger = new Logger('LayerEnforcer');

    for (const v of violations) {
      logger.warn(v.message);
    }

    if (options?.strict) {
      throw new Error(
        `Layer violations detected (strict mode):\n${violations.map((v) => `  - ${v.message}`).join('\n')}`,
      );
    }
  }

  return result;
}
