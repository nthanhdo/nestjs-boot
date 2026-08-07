import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Module } from '@nestjs/common';
import { Layer, ModuleLayer, LAYER_KEY } from '../../src/layers/layer.decorator';
import { validateLayers, LayerValidationResult } from '../../src/layers/layer-enforcer';

// --- Helper: build a fake NestJS app with a module graph ---

interface FakeModuleEntry {
  metatype: any;
  imports: Map<string, { metatype: any }>;
}

function createFakeApp(modules: FakeModuleEntry[]): any {
  const modulesMap = new Map<string, FakeModuleEntry>();
  for (const mod of modules) {
    modulesMap.set(mod.metatype.name, mod);
  }
  return {
    container: {
      getModules: () => modulesMap,
    },
  };
}

function entry(metatype: any, imports: any[] = []): FakeModuleEntry {
  const importsMap = new Map<string, { metatype: any }>();
  for (const imp of imports) {
    importsMap.set(imp.name, { metatype: imp });
  }
  return { metatype, imports: importsMap };
}

// --- Test modules ---

@Layer(ModuleLayer.CORE)
@Module({})
class CoreMod {}

@Layer(ModuleLayer.INFRASTRUCTURE)
@Module({})
class InfraMod {}

@Layer(ModuleLayer.DOMAIN)
@Module({})
class DomainMod {}

@Layer(ModuleLayer.APPLICATION)
@Module({})
class AppMod {}

@Module({})
class UnlabeledMod {} // no @Layer — defaults to DOMAIN

describe('Layer Enforcer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('valid layering passes (app -> domain -> infra -> core)', () => {
    const app = createFakeApp([
      entry(AppMod, [DomainMod]),
      entry(DomainMod, [InfraMod]),
      entry(InfraMod, [CoreMod]),
      entry(CoreMod),
    ]);

    const result = validateLayers(app);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects upward import as violation', () => {
    // InfraMod importing AppMod = INFRA(1) -> APPLICATION(3) = violation
    const app = createFakeApp([
      entry(InfraMod, [AppMod]),
      entry(AppMod),
    ]);

    const result = validateLayers(app);
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].module).toBe('InfraMod');
    expect(result.violations[0].importedModule).toBe('AppMod');
    expect(result.violations[0].moduleLayer).toBe(ModuleLayer.INFRASTRUCTURE);
    expect(result.violations[0].importedLayer).toBe(ModuleLayer.APPLICATION);
  });

  it('allows same-layer imports (no violation)', () => {
    @Layer(ModuleLayer.DOMAIN)
    @Module({})
    class DomainA {}

    @Layer(ModuleLayer.DOMAIN)
    @Module({})
    class DomainB {}

    const app = createFakeApp([
      entry(DomainA, [DomainB]),
      entry(DomainB),
    ]);

    const result = validateLayers(app);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('strict mode throws on violation', () => {
    const app = createFakeApp([
      entry(CoreMod, [AppMod]),
      entry(AppMod),
    ]);

    expect(() => validateLayers(app, { strict: true })).toThrow(
      /Layer violations detected/,
    );
  });

  it('non-strict mode does not throw (warns only)', () => {
    const app = createFakeApp([
      entry(CoreMod, [AppMod]),
      entry(AppMod),
    ]);

    // Should not throw
    const result = validateLayers(app, { strict: false });
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('custom allow rules bypass specific violations', () => {
    const app = createFakeApp([
      entry(InfraMod, [AppMod]),
      entry(AppMod),
    ]);

    const result = validateLayers(app, {
      customRules: {
        allow: [{ from: 'InfraMod', to: 'AppMod' }],
      },
    });

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('modules without @Layer default to DOMAIN', () => {
    // UnlabeledMod (default DOMAIN=2) importing AppMod (APPLICATION=3) = violation
    const app = createFakeApp([
      entry(UnlabeledMod, [AppMod]),
      entry(AppMod),
    ]);

    const result = validateLayers(app);
    expect(result.valid).toBe(false);
    expect(result.violations[0].moduleLayer).toBe(ModuleLayer.DOMAIN);
    expect(result.violations[0].importedLayer).toBe(ModuleLayer.APPLICATION);
  });

  it('nestjs-boot core modules are auto-assigned CORE layer', () => {
    // Simulate a module named "DatabaseModule" — should be CORE(0)
    @Module({})
    class DatabaseModule {}

    const app = createFakeApp([
      entry(DatabaseModule, [AppMod]),
      entry(AppMod),
    ]);

    const result = validateLayers(app);
    // CORE(0) importing APPLICATION(3) = violation
    expect(result.valid).toBe(false);
    expect(result.violations[0].moduleLayer).toBe(ModuleLayer.CORE);
  });

  it('returns valid for app with no container', () => {
    const result = validateLayers({} as any);
    expect(result.valid).toBe(true);
  });
});
