import { StoredEvent } from '../domain-event';
import { EventStore, ConcurrencyError } from '../interfaces';

/**
 * In-memory EventStore implementation.
 *
 * Suitable for testing and development. Data is lost on process restart.
 * Implements the same interface as MongoDBEventStore — fully swappable.
 */
export class MemoryEventStore implements EventStore {
  private readonly streams = new Map<string, StoredEvent[]>();
  private globalPosition = 0;

  async append(streamId: string, events: StoredEvent[], expectedVersion?: number): Promise<void> {
    const stream = this.streams.get(streamId) ?? [];
    const currentVersion = stream.length > 0 ? stream[stream.length - 1].version : 0;

    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      throw new ConcurrencyError(streamId, expectedVersion, currentVersion);
    }

    let version = currentVersion;
    for (const event of events) {
      version++;
      this.globalPosition++;
      stream.push({
        ...event,
        streamId,
        version,
        position: this.globalPosition,
        metadata: {
          ...event.metadata,
          timestamp: event.metadata?.timestamp ?? new Date(),
        },
      });
    }

    this.streams.set(streamId, stream);
  }

  async getEvents(streamId: string, fromVersion?: number): Promise<StoredEvent[]> {
    const stream = this.streams.get(streamId) ?? [];
    if (fromVersion !== undefined) {
      return stream.filter((e) => e.version > fromVersion);
    }
    return [...stream];
  }

  async getAllEvents(fromPosition?: number): Promise<StoredEvent[]> {
    const all: StoredEvent[] = [];
    for (const stream of this.streams.values()) {
      all.push(...stream);
    }
    all.sort((a, b) => a.position - b.position);

    if (fromPosition !== undefined) {
      return all.filter((e) => e.position > fromPosition);
    }
    return all;
  }

  /** @internal — for testing: clear all data */
  clear(): void {
    this.streams.clear();
    this.globalPosition = 0;
  }
}
