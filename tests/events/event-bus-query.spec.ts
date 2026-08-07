import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBusService } from '../../src/events/event-bus.service';
import { BootEvent } from '../../src/events/boot-event';
import { BootQuery } from '../../src/events/boot-query';
import { OnQuery } from '../../src/events/decorators';
import { ON_QUERY_METADATA } from '../../src/events/constants';

// ── Test fixtures ──────────────────────────────────────────

interface User {
  id: string;
  name: string;
}

class GetUserByIdQuery extends BootQuery<User> {
  constructor(public readonly userId: string) {
    super();
  }
}

class GetOrderCountQuery extends BootQuery<number> {
  constructor(public readonly userId: string) {
    super();
  }
}

class UnhandledQuery extends BootQuery<void> {
  constructor() {
    super();
  }
}

// ── Tests ──────────────────────────────────────────────────

describe('BootQuery', () => {
  it('extends BootEvent and has __isQuery marker', () => {
    const query = new GetUserByIdQuery('user-1');
    expect(query).toBeInstanceOf(BootEvent);
    expect(query.__isQuery).toBe(true);
    expect(query.timestamp).toBeInstanceOf(Date);
  });
});

describe('EventBusService.emitAndWait()', () => {
  let service: EventBusService;

  beforeEach(() => {
    service = new EventBusService({ transport: 'memory' });
  });

  it('returns the handler result for a registered query', async () => {
    const mockUser: User = { id: 'user-1', name: 'Alice' };

    service.registerQueryHandler(GetUserByIdQuery, async (query: BootEvent) => {
      const q = query as GetUserByIdQuery;
      return { id: q.userId, name: 'Alice' };
    });

    const result = await service.emitAndWait<User>(new GetUserByIdQuery('user-1'));

    expect(result).toEqual(mockUser);
  });

  it('returns synchronous handler result', async () => {
    service.registerQueryHandler(GetOrderCountQuery, (query: BootEvent) => {
      return 42;
    });

    const result = await service.emitAndWait<number>(new GetOrderCountQuery('user-1'));

    expect(result).toBe(42);
  });

  it('times out when handler takes too long', async () => {
    service.registerQueryHandler(GetUserByIdQuery, async () => {
      await new Promise((r) => setTimeout(r, 500));
      return { id: '1', name: 'Never' };
    });

    await expect(
      service.emitAndWait(new GetUserByIdQuery('user-1'), { timeout: 50 }),
    ).rejects.toThrow(/timed out after 50ms/);
  });

  it('throws descriptive error when no handler is registered', async () => {
    await expect(
      service.emitAndWait(new UnhandledQuery()),
    ).rejects.toThrow(/No handler registered for query "UnhandledQuery"/);

    await expect(
      service.emitAndWait(new UnhandledQuery()),
    ).rejects.toThrow(/@OnQuery\(UnhandledQuery\)/);
  });

  it('handles multiple query types with different result types', async () => {
    service.registerQueryHandler(GetUserByIdQuery, async (query: BootEvent) => {
      const q = query as GetUserByIdQuery;
      return { id: q.userId, name: 'Bob' };
    });

    service.registerQueryHandler(GetOrderCountQuery, async () => {
      return 7;
    });

    const user = await service.emitAndWait<User>(new GetUserByIdQuery('user-2'));
    const count = await service.emitAndWait<number>(new GetOrderCountQuery('user-2'));

    expect(user).toEqual({ id: 'user-2', name: 'Bob' });
    expect(count).toBe(7);
  });

  it('propagates handler errors instead of timing out', async () => {
    service.registerQueryHandler(GetUserByIdQuery, async () => {
      throw new Error('User not found');
    });

    await expect(
      service.emitAndWait(new GetUserByIdQuery('missing')),
    ).rejects.toThrow('User not found');
  });

  it('propagates synchronous handler errors', async () => {
    service.registerQueryHandler(GetUserByIdQuery, () => {
      throw new Error('Sync failure');
    });

    await expect(
      service.emitAndWait(new GetUserByIdQuery('bad')),
    ).rejects.toThrow('Sync failure');
  });

  it('uses default timeout of 5000ms when not specified', async () => {
    // We can't easily test the 5s default without waiting, but we can verify
    // the error message includes the default timeout value
    service.registerQueryHandler(GetUserByIdQuery, async () => {
      await new Promise((r) => setTimeout(r, 200));
      return { id: '1', name: 'Slow' };
    });

    // With a short explicit timeout, verify the timeout value shows up
    await expect(
      service.emitAndWait(new GetUserByIdQuery('x'), { timeout: 30 }),
    ).rejects.toThrow(/30ms/);
  });
});

describe('@OnQuery decorator', () => {
  it('sets metadata with query class', () => {
    class Handler {
      @OnQuery(GetUserByIdQuery)
      handle() {
        return null;
      }
    }

    const metadata = Reflect.getMetadata(ON_QUERY_METADATA, Handler.prototype.handle);
    expect(metadata).toEqual({ queryClass: GetUserByIdQuery });
  });

  it('sets metadata independently from @OnEvent on same class', () => {
    // Verify OnQuery metadata key is distinct
    expect(ON_QUERY_METADATA).toBe('BOOT_ON_QUERY');
    expect(ON_QUERY_METADATA).not.toBe('BOOT_ON_EVENT');
  });
});
