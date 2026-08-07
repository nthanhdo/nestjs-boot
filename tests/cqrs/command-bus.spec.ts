import { describe, it, expect, beforeEach } from 'vitest';
import { CommandBus, ICommand, ICommandHandler } from '../../src/cqrs/command-bus';

class CreateOrderCommand implements ICommand {
  readonly type = 'CreateOrder';
  constructor(public readonly customerId: string, public readonly total: number) {}
}

class ShipOrderCommand implements ICommand {
  readonly type = 'ShipOrder';
  constructor(public readonly orderId: string) {}
}

describe('CommandBus', () => {
  let bus: CommandBus;

  beforeEach(() => {
    bus = new CommandBus();
  });

  it('executes and routes to the correct handler', async () => {
    const handler: ICommandHandler<CreateOrderCommand> = {
      execute: async (cmd) => ({ id: 'order-1', customerId: cmd.customerId }),
    };
    bus.register('CreateOrder', handler);

    const result = await bus.execute<{ id: string }>(new CreateOrderCommand('cust-1', 100));
    expect(result).toEqual({ id: 'order-1', customerId: 'cust-1' });
  });

  it('throws when no handler is registered for a command', async () => {
    await expect(bus.execute(new CreateOrderCommand('cust-1', 50)))
      .rejects.toThrow('No handler registered for command "CreateOrder"');
  });

  it('handler receives full command data', async () => {
    let receivedCommand: CreateOrderCommand | null = null;
    const handler: ICommandHandler<CreateOrderCommand> = {
      execute: async (cmd) => { receivedCommand = cmd; },
    };
    bus.register('CreateOrder', handler);

    await bus.execute(new CreateOrderCommand('cust-42', 999));
    expect(receivedCommand).not.toBeNull();
    expect(receivedCommand!.customerId).toBe('cust-42');
    expect(receivedCommand!.total).toBe(999);
  });

  it('routes multiple command types to different handlers', async () => {
    const createHandler: ICommandHandler = {
      execute: async () => 'created',
    };
    const shipHandler: ICommandHandler = {
      execute: async () => 'shipped',
    };
    bus.register('CreateOrder', createHandler);
    bus.register('ShipOrder', shipHandler);

    expect(await bus.execute<string>(new CreateOrderCommand('c', 1))).toBe('created');
    expect(await bus.execute<string>(new ShipOrderCommand('o-1'))).toBe('shipped');
  });
});
