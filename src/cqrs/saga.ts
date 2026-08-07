import { Logger } from '@nestjs/common';

/**
 * A single step in a saga — has an execute function and a compensating action.
 */
export interface SagaStep<TContext> {
  name: string;
  execute: (context: TContext) => Promise<unknown>;
  compensate: (context: TContext, error: Error) => Promise<void>;
}

/**
 * Immutable definition of a saga — a sequence of steps with compensations.
 */
export interface SagaDefinition<TContext = Record<string, unknown>> {
  name: string;
  steps: ReadonlyArray<SagaStep<TContext>>;
}

/**
 * Result of a saga execution.
 */
export interface SagaResult {
  success: boolean;
  completedSteps: string[];
  failedStep?: string;
  error?: Error;
  compensatedSteps?: string[];
}

/**
 * Builder for constructing saga definitions with a fluent API.
 *
 * @example
 * ```ts
 * const createOrderSaga = defineSaga<OrderContext>('create-order')
 *   .step('reserve-inventory', reserveInventory, compensateInventory)
 *   .step('charge-payment', chargePayment, refundPayment)
 *   .step('create-shipment', createShipment, cancelShipment)
 *   .build();
 * ```
 */
export class SagaBuilder<TContext = Record<string, unknown>> {
  private readonly steps: SagaStep<TContext>[] = [];

  constructor(private readonly name: string) {}

  step(
    name: string,
    execute: (context: TContext) => Promise<unknown>,
    compensate: (context: TContext, error: Error) => Promise<void>,
  ): SagaBuilder<TContext> {
    this.steps.push({ name, execute, compensate });
    return this;
  }

  build(): SagaDefinition<TContext> {
    if (this.steps.length === 0) {
      throw new Error(`Saga "${this.name}" must have at least one step`);
    }
    return {
      name: this.name,
      steps: [...this.steps],
    };
  }
}

/**
 * Entry point for building a saga definition.
 */
export function defineSaga<TContext = Record<string, unknown>>(name: string): SagaBuilder<TContext> {
  return new SagaBuilder<TContext>(name);
}

/**
 * SagaRunner — executes saga definitions with compensation on failure.
 *
 * When a step fails, compensating actions are executed in REVERSE order
 * for all previously completed steps.
 *
 * @example
 * ```ts
 * const runner = new SagaRunner();
 * const result = await runner.execute(createOrderSaga, { orderId, items, userId });
 * if (!result.success) {
 *   console.error(`Saga failed at step "${result.failedStep}":`, result.error);
 *   console.log('Compensated steps:', result.compensatedSteps);
 * }
 * ```
 */
export class SagaRunner {
  private readonly logger = new Logger('SagaRunner');

  async execute<TContext>(
    saga: SagaDefinition<TContext>,
    context: TContext,
  ): Promise<SagaResult> {
    const completedSteps: string[] = [];

    for (const step of saga.steps) {
      try {
        this.logger.debug(`[${saga.name}] Executing step: ${step.name}`);
        await step.execute(context);
        completedSteps.push(step.name);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `[${saga.name}] Step "${step.name}" failed: ${err.message}`,
        );

        // Compensate in reverse order
        const compensatedSteps = await this.compensate(
          saga.name,
          completedSteps,
          saga.steps,
          context,
          err,
        );

        return {
          success: false,
          completedSteps,
          failedStep: step.name,
          error: err,
          compensatedSteps,
        };
      }
    }

    this.logger.debug(`[${saga.name}] Saga completed successfully`);
    return { success: true, completedSteps };
  }

  private async compensate<TContext>(
    sagaName: string,
    completedStepNames: string[],
    allSteps: ReadonlyArray<SagaStep<TContext>>,
    context: TContext,
    error: Error,
  ): Promise<string[]> {
    const compensated: string[] = [];

    // Reverse order compensation
    for (let i = completedStepNames.length - 1; i >= 0; i--) {
      const stepName = completedStepNames[i];
      const step = allSteps.find((s) => s.name === stepName);
      if (!step) continue;

      try {
        this.logger.debug(`[${sagaName}] Compensating step: ${stepName}`);
        await step.compensate(context, error);
        compensated.push(stepName);
      } catch (compError) {
        this.logger.error(
          `[${sagaName}] Compensation failed for step "${stepName}": ${(compError as Error).message}`,
        );
        // Continue compensating remaining steps even if one fails
        compensated.push(stepName);
      }
    }

    return compensated;
  }
}
