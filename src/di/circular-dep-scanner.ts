import { Logger } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';

interface ModuleNode {
  name: string;
  imports: string[];
}

/**
 * Scans the NestJS module graph after successful boot and warns about:
 * 1. Mutual imports (Module A imports Module B AND B imports A)
 * 2. Modules with >10 imports (god-module smell)
 *
 * Dev-mode only, non-blocking. Call after NestFactory.create() succeeds.
 */
export function scanForCircularDepWarnings(app: INestApplication): void {
  const logger = new Logger('nestjs-boot:di');

  try {
    // Access NestJS internal ModulesContainer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const container = (app as any).container;
    if (!container) return;

    const modulesMap = container.getModules?.();
    if (!modulesMap) return;

    const nodes: ModuleNode[] = [];
    const importEdges = new Map<string, Set<string>>();

    for (const [, moduleWrapper] of modulesMap) {
      const metatype = moduleWrapper.metatype;
      if (!metatype) continue;

      const name = metatype.name || 'Anonymous';
      // Skip NestJS internal modules
      if (name === 'InternalCoreModule' || name === 'Module') continue;

      const imports = new Set<string>();

      // Walk the module's imported modules
      const importedModules = moduleWrapper.imports;
      if (importedModules) {
        for (const [, imported] of importedModules) {
          const importedName = imported?.metatype?.name;
          if (importedName && importedName !== 'InternalCoreModule') {
            imports.add(importedName);
          }
        }
      }

      nodes.push({ name, imports: [...imports] });
      importEdges.set(name, imports);
    }

    // Check 1: Mutual imports (A→B and B→A)
    const reported = new Set<string>();
    for (const [modA, importsA] of importEdges) {
      for (const modB of importsA) {
        const importsB = importEdges.get(modB);
        if (importsB?.has(modA)) {
          const key = [modA, modB].sort().join('↔');
          if (!reported.has(key)) {
            reported.add(key);
            logger.warn(
              `Mutual import detected: ${modA} ↔ ${modB}. ` +
              `This is a circular dependency risk. Consider using EventBusModule ` +
              `or the contract pattern to decouple them. ` +
              `See: docs/guides/circular-dependency-prevention.md`,
            );
          }
        }
      }
    }

    // Check 2: God-module smell (>10 imports)
    for (const node of nodes) {
      if (node.imports.length > 10) {
        logger.warn(
          `Module "${node.name}" imports ${node.imports.length} modules. ` +
          `Consider splitting it into smaller, focused modules to reduce coupling.`,
        );
      }
    }
  } catch {
    // Non-blocking — if introspection fails, silently skip
  }
}
