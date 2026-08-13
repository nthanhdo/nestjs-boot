import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Injectable, Logger } from '@nestjs/common';
import { DeployService } from '../../src/deploy/deploy.service';
import { DeployHooksModule } from '../../src/deploy/deploy.module';
import { OnDeploy } from '../../src/deploy/decorators';
import { EnvValidationHook } from '../../src/deploy/hooks/env-validation.hook';
import { DeployContext, DeployPhase } from '../../src/deploy/interfaces';

function makeContext(phase: DeployPhase = 'preStart'): DeployContext {
  return {
    phase,
    environment: 'test',
    version: '1.0.0',
    startTime: new Date(),
    logger: new Logger('Test'),
    config: {},
  };
}

describe('DeployService', () => {
  let service: DeployService;

  beforeEach(() => {
    service = new DeployService();
  });

  it('should execute hooks in order within a phase', async () => {
    const order: string[] = [];

    service.registerHook({
      name: 'second',
      phase: 'preStart',
      order: 10,
      execute: async () => { order.push('second'); },
    });
    service.registerHook({
      name: 'first',
      phase: 'preStart',
      order: -5,
      execute: async () => { order.push('first'); },
    });
    service.registerHook({
      name: 'third',
      phase: 'preStart',
      order: 20,
      execute: async () => { order.push('third'); },
    });

    await service.executePhase('preStart', makeContext());
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('should only run hooks matching the requested phase', async () => {
    const executed: string[] = [];

    service.registerHook({
      name: 'pre',
      phase: 'preStart',
      execute: async () => { executed.push('pre'); },
    });
    service.registerHook({
      name: 'post',
      phase: 'postStart',
      execute: async () => { executed.push('post'); },
    });

    await service.executePhase('preStart', makeContext());
    expect(executed).toEqual(['pre']);
  });

  it('should skip gracefully when no hooks registered for phase', async () => {
    // Should not throw
    await service.executePhase('healthGate', makeContext('healthGate'));
  });

  it('should propagate hook errors', async () => {
    service.registerHook({
      name: 'failing',
      phase: 'postStart',
      execute: async () => { throw new Error('boom'); },
    });

    await expect(
      service.executePhase('postStart', makeContext('postStart')),
    ).rejects.toThrow('boom');
  });

  it('should default order to 0', async () => {
    const order: string[] = [];

    service.registerHook({
      name: 'explicit-zero',
      phase: 'preStart',
      order: 0,
      execute: async () => { order.push('a'); },
    });
    service.registerHook({
      name: 'implicit-zero',
      phase: 'preStart',
      // no order field
      execute: async () => { order.push('b'); },
    });

    await service.executePhase('preStart', makeContext());
    // Both have order 0, so stable insertion order
    expect(order).toEqual(['a', 'b']);
  });
});

describe('EnvValidationHook', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('should pass when all required vars exist', async () => {
    process.env.FOO = 'bar';
    process.env.BAZ = 'qux';
    const hook = new EnvValidationHook(['FOO', 'BAZ']);
    await expect(hook.execute(makeContext())).resolves.not.toThrow();
  });

  it('should throw when required vars are missing', async () => {
    delete process.env.MISSING_VAR;
    const hook = new EnvValidationHook(['MISSING_VAR']);
    await expect(hook.execute(makeContext())).rejects.toThrow('Missing required environment variables: MISSING_VAR');
  });

  it('should list all missing vars', async () => {
    delete process.env.A;
    delete process.env.B;
    const hook = new EnvValidationHook(['A', 'B']);
    await expect(hook.execute(makeContext())).rejects.toThrow('A, B');
  });
});

describe('@OnDeploy decorator scanning', () => {
  @Injectable()
  class TestHookProvider {
    public calls: string[] = [];

    @OnDeploy('postStart', 5)
    async onPostStart(_ctx: DeployContext): Promise<void> {
      this.calls.push('postStart');
    }

    @OnDeploy('preStart')
    async onPreStart(_ctx: DeployContext): Promise<void> {
      this.calls.push('preStart');
    }
  }

  it('should discover and register decorated methods', async () => {
    const module = await Test.createTestingModule({
      imports: [DeployHooksModule.register({})],
      providers: [TestHookProvider],
    }).compile();

    await module.init();

    const deployService = module.get(DeployService);
    const hooks = deployService.getHooks();

    const hookNames = hooks.map((h) => h.name);
    expect(hookNames).toContain('TestHookProvider.onPostStart');
    expect(hookNames).toContain('TestHookProvider.onPreStart');

    // Verify phase assignment
    const postHook = hooks.find((h) => h.name === 'TestHookProvider.onPostStart');
    expect(postHook?.phase).toBe('postStart');
    expect(postHook?.order).toBe(5);

    const preHook = hooks.find((h) => h.name === 'TestHookProvider.onPreStart');
    expect(preHook?.phase).toBe('preStart');
    expect(preHook?.order).toBe(0);

    await module.close();
  });

  it('should execute discovered hooks via DeployService', async () => {
    const module = await Test.createTestingModule({
      imports: [DeployHooksModule.register({})],
      providers: [TestHookProvider],
    }).compile();

    await module.init();

    const deployService = module.get(DeployService);
    const provider = module.get(TestHookProvider);

    // Verify the hooks are registered and will call the same provider instance
    const hooks = deployService.getHooks();
    const preHook = hooks.find((h) => h.name === 'TestHookProvider.onPreStart')!;
    expect(preHook).toBeDefined();

    await preHook.execute(makeContext());
    expect(provider.calls).toContain('preStart');

    provider.calls.length = 0; // reset

    await deployService.executePhase('preStart', makeContext());
    expect(provider.calls).toEqual(['preStart']);

    await deployService.executePhase('postStart', makeContext('postStart'));
    expect(provider.calls).toEqual(['preStart', 'postStart']);

    await module.close();
  });
});

describe('Graceful behavior when deploy config omitted', () => {
  it('should work with empty options', async () => {
    const module = await Test.createTestingModule({
      imports: [DeployHooksModule.register()],
    }).compile();

    const deployService = module.get(DeployService);
    expect(deployService.getHooks()).toHaveLength(0);

    // Should not throw
    await deployService.executePhase('preStart', makeContext());

    await module.close();
  });
});
