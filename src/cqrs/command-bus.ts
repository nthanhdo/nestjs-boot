import { Injectable, Logger, Type } from '@nestjs/common';

/**
 * Marker interface for commands — intent to change state.
 *
 * Commands are imperative, present-tense ("CreateOrder", "ShipOrder").
 * Each command has exactly ONE handler. Commands may be rejected.
 *
 * @example
 * ```ts
 * class CreateOrderCommand implements ICommand {
 *   readonly type = 'CreateOrder';
 *   constructor(
 *     public readonly customerId: string,
 *     public readonly items: { sku: string; qty: number }[],
 *   ) {}
 * }
 * ```
 */
export interface ICommand {
  readonly type: string;
}

/**
 * Interface for command handlers.
 *
 * @example
 * ```ts
 * @CommandHandler(CreateOrderCommand)
 * class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
 *   async execute(command: CreateOrderCommand) {
 *     const order = Order.create(command.customerId, command.items);
 *     await this.repository.save(order);
 *     return order.id;
 *   }
 * }
 * ```
 */
export interface ICommandHandler<T extends ICommand = ICommand> {
  execute(command: T): Promise<unknown>;
}

/** Metadata key for @CommandHandler decorator */
export const COMMAND_HANDLER_METADATA = 'CQRS_COMMAND_HANDLER';

/**
 * Decorator that marks a class as the handler for a specific command.
 * Each command type must have exactly one handler.
 */
export function CommandHandler(command: Type<ICommand>): ClassDecorator {
   
  return (target: any) => {
    Reflect.defineMetadata(COMMAND_HANDLER_METADATA, command, target);
    return target;
  };
}

/**
 * CommandBus — routes commands to their registered handlers.
 *
 * Unlike the EventBus (which fans out to multiple handlers),
 * the CommandBus enforces 1:1 routing: one command type → one handler.
 *
 * @example
 * ```ts
 * const orderId = await commandBus.execute<string>(
 *   new CreateOrderCommand('cust-1', [{ sku: 'SKU-A', qty: 2 }]),
 * );
 * ```
 */
@Injectable()
export class CommandBus {
  private readonly logger = new Logger('CommandBus');
  private readonly handlers = new Map<string, ICommandHandler>();

  /**
   * Register a handler for a command type.
   * @internal — called during module initialization
   */
  register(commandType: string, handler: ICommandHandler): void {
    if (this.handlers.has(commandType)) {
      this.logger.warn(`Command handler for "${commandType}" is being overwritten`);
    }
    this.handlers.set(commandType, handler);
  }

  /**
   * Execute a command by routing it to the registered handler.
   *
   * @throws Error if no handler is registered for the command type
   */
  async execute<T = unknown>(command: ICommand): Promise<T> {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      throw new Error(
        `No handler registered for command "${command.type}". ` +
        `Did you forget to use @CommandHandler(${command.type}) on a provider?`,
      );
    }
    return handler.execute(command) as Promise<T>;
  }
}
