import { BootEvent } from './boot-event';

/**
 * Base class for query events that expect a return value.
 *
 * Use BootQuery instead of BootEvent when you need a response
 * from a handler — this replaces direct service calls that cause
 * circular dependencies.
 *
 * @example
 * ```ts
 * class GetUserByIdQuery extends BootQuery<User> {
 *   constructor(public readonly userId: string) { super(); }
 * }
 *
 * // Emit and wait for the result:
 * const user = await eventBus.emitAndWait(new GetUserByIdQuery('123'));
 * ```
 *
 * @typeParam TResult - The expected return type from the handler
 */
export abstract class BootQuery<TResult = unknown> extends BootEvent {
  /** @internal marker to distinguish queries from plain events at runtime */
  readonly __isQuery = true as const;

  /**
   * @internal Phantom field to anchor the TResult generic at the type level.
   * Never access this at runtime — it exists only so TypeScript preserves
   * the generic parameter for type inference in emitAndWait<T>().
   */
  declare readonly __resultType: TResult;
}
