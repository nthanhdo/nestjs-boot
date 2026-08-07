import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutboxProcessor, OutboxEntry } from '../../src/cqrs/outbox-processor';

// Mock MongoDB connection + collection
function createMockConnection() {
  const docs: OutboxEntry[] = [];

  const collection = (name: string) => {
    if (name === 'outbox') {
      return {
        createIndex: vi.fn().mockResolvedValue(undefined),
        insertOne: vi.fn().mockImplementation(async (doc: OutboxEntry) => {
          doc._id = `id-${docs.length}`;
          docs.push({ ...doc });
        }),
        find: vi.fn().mockImplementation((filter: Partial<OutboxEntry>) => ({
          sort: () => ({
            limit: () => ({
              toArray: async () => {
                return docs.filter((d) => {
                  if (filter.published !== undefined && d.published !== filter.published) return false;
                  if (filter.retryCount?.$lt !== undefined && d.retryCount >= filter.retryCount.$lt) return false;
                  return true;
                });
              },
            }),
          }),
        })),
        updateOne: vi.fn().mockImplementation(async (filter: { _id: string }, update: Record<string, unknown>) => {
          const idx = docs.findIndex((d) => d._id === filter._id);
          if (idx >= 0) {
            if (update.$set) Object.assign(docs[idx], update.$set);
            if (update.$inc) {
              for (const [key, val] of Object.entries(update.$inc)) {
                (docs[idx] as Record<string, unknown>)[key] =
                  ((docs[idx] as Record<string, unknown>)[key] as number || 0) + (val as number);
              }
            }
          }
        }),
      };
    }
    return { createIndex: vi.fn() };
  };

  return {
    db: { collection },
    _docs: docs,
  };
}

function createMockEventBus() {
  const emitted: unknown[] = [];
  return {
    emitAsync: vi.fn().mockImplementation(async (event: unknown) => {
      emitted.push(event);
    }),
    _emitted: emitted,
  };
}

describe('OutboxProcessor', () => {
  let mockConn: ReturnType<typeof createMockConnection>;
  let mockBus: ReturnType<typeof createMockEventBus>;
  let processor: OutboxProcessor;

  beforeEach(async () => {
    mockConn = createMockConnection();
    mockBus = createMockEventBus();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processor = new OutboxProcessor(mockConn as any, mockBus as any, 60000, 3);
    // Initialize manually (bypass setInterval)
    processor['db'] = mockConn.db;
  });

  it('persists events to the outbox collection', async () => {
    await processor.persistToOutbox('OrderCreated', { orderId: 'o1', total: 100 });

    expect(mockConn._docs).toHaveLength(1);
    expect(mockConn._docs[0].type).toBe('OrderCreated');
    expect(mockConn._docs[0].published).toBe(false);
    expect(mockConn._docs[0].retryCount).toBe(0);
  });

  it('processor publishes pending events via EventBus', async () => {
    // Insert an unpublished entry
    mockConn._docs.push({
      _id: 'entry-1',
      type: 'OrderCreated',
      data: { orderId: 'o1' },
      createdAt: new Date(),
      published: false,
      retryCount: 0,
    });

    const count = await processor.processOutbox();

    expect(count).toBe(1);
    expect(mockBus.emitAsync).toHaveBeenCalledTimes(1);
    // Entry should be marked as published
    expect(mockConn._docs[0].published).toBe(true);
  });

  it('failed events are retried up to maxRetries', async () => {
    // Insert entry that will fail
    mockConn._docs.push({
      _id: 'entry-fail',
      type: 'FailingEvent',
      data: {},
      createdAt: new Date(),
      published: false,
      retryCount: 0,
    });

    // Make emitAsync throw
    mockBus.emitAsync.mockRejectedValueOnce(new Error('publish failed'));

    await processor.processOutbox();

    // retryCount should be incremented
    expect(mockConn._docs[0].retryCount).toBe(1);
    expect(mockConn._docs[0].published).toBe(false);
    expect(mockConn._docs[0].lastError).toBe('publish failed');
  });
});
