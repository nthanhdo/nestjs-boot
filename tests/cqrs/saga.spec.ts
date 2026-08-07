import { describe, it, expect, vi } from 'vitest';
import { defineSaga, SagaRunner } from '../../src/cqrs/saga';

interface TestContext {
  orderId: string;
  log: string[];
}

describe('Saga', () => {
  it('should execute all steps on success', async () => {
    const saga = defineSaga<TestContext>('test-saga')
      .step('step1', async (ctx) => { ctx.log.push('exec1'); }, async () => {})
      .step('step2', async (ctx) => { ctx.log.push('exec2'); }, async () => {})
      .step('step3', async (ctx) => { ctx.log.push('exec3'); }, async () => {})
      .build();

    const runner = new SagaRunner();
    const ctx: TestContext = { orderId: '123', log: [] };
    const result = await runner.execute(saga, ctx);

    expect(result.success).toBe(true);
    expect(result.completedSteps).toEqual(['step1', 'step2', 'step3']);
    expect(ctx.log).toEqual(['exec1', 'exec2', 'exec3']);
  });

  it('should compensate in REVERSE order when a step fails', async () => {
    const compensationOrder: string[] = [];

    const saga = defineSaga<TestContext>('reverse-comp')
      .step(
        'reserve',
        async (ctx) => { ctx.log.push('reserve'); },
        async () => { compensationOrder.push('undo-reserve'); },
      )
      .step(
        'charge',
        async (ctx) => { ctx.log.push('charge'); },
        async () => { compensationOrder.push('undo-charge'); },
      )
      .step(
        'ship',
        async () => { throw new Error('shipping failed'); },
        async () => { compensationOrder.push('undo-ship'); },
      )
      .build();

    const runner = new SagaRunner();
    const ctx: TestContext = { orderId: '456', log: [] };
    const result = await runner.execute(saga, ctx);

    expect(result.success).toBe(false);
    expect(result.failedStep).toBe('ship');
    expect(result.error?.message).toBe('shipping failed');
    expect(result.completedSteps).toEqual(['reserve', 'charge']);
    // Compensation must be in reverse order: charge first, then reserve
    expect(compensationOrder).toEqual(['undo-charge', 'undo-reserve']);
  });

  it('should return empty completedSteps when first step fails', async () => {
    const saga = defineSaga<TestContext>('first-fail')
      .step(
        'step1',
        async () => { throw new Error('boom'); },
        async () => {},
      )
      .build();

    const runner = new SagaRunner();
    const result = await runner.execute(saga, { orderId: '1', log: [] });

    expect(result.success).toBe(false);
    expect(result.completedSteps).toEqual([]);
    expect(result.compensatedSteps).toEqual([]);
  });

  it('should continue compensating even if a compensation fails', async () => {
    const compensated: string[] = [];

    const saga = defineSaga<TestContext>('comp-fail')
      .step(
        'a',
        async (ctx) => { ctx.log.push('a'); },
        async () => { compensated.push('undo-a'); },
      )
      .step(
        'b',
        async (ctx) => { ctx.log.push('b'); },
        async () => { throw new Error('comp-b failed'); },
      )
      .step(
        'c',
        async () => { throw new Error('c failed'); },
        async () => {},
      )
      .build();

    const runner = new SagaRunner();
    const ctx: TestContext = { orderId: '789', log: [] };
    const result = await runner.execute(saga, ctx);

    expect(result.success).toBe(false);
    // Even though compensation for 'b' threw, 'a' compensation still ran
    expect(compensated).toContain('undo-a');
  });

  it('should throw when building a saga with no steps', () => {
    expect(() => defineSaga('empty').build()).toThrow('must have at least one step');
  });
});
