import { Injectable, Logger } from '@nestjs/common';
import { StoredEvent } from './domain-event';
import { EventStore } from './interfaces';
import { ON_DOMAIN_EVENT_METADATA } from './decorators';

/**
 * Result of a replay operation.
 */
export interface ReplayResult {
  /** Total events processed */
  eventsProcessed: number;
  /** Time taken in ms */
  durationMs: number;
  /** Per-projection event counts */
  projectionCounts: Record<string, number>;
  /** Errors encountered (non-fatal — replay continues) */
  errors: { position: number; type: string; error: string }[];
}

/**
 * EventReplayService — rebuilds read models by replaying stored events
 * through projections.
 *
 * Use cases:
 * - Rebuild a corrupted read model from scratch
 * - Backfill a new projection with historical data
 * - Debug: replay events to a specific point in time
 *
 * @example
 * ```ts
 * const result = await replayService.replayAll([orderSummaryProjection]);
 * console.log(`Replayed ${result.eventsProcessed} events in ${result.durationMs}ms`);
 * ```
 */
@Injectable()
export class EventReplayService {
  private readonly logger = new Logger('EventReplayService');

  constructor(private readonly eventStore: EventStore) {}

  /**
   * Replay ALL events through the given projection instances.
   */
  async replayAll(projections: object[]): Promise<ReplayResult> {
    return this.replay(projections, () => this.eventStore.getAllEvents());
  }

  /**
   * Replay events from a specific global position.
   */
  async replayFrom(position: number, projections: object[]): Promise<ReplayResult> {
    return this.replay(projections, () => this.eventStore.getAllEvents(position));
  }

  /**
   * Replay events from a single stream through projections.
   */
  async replayStream(streamId: string, projections: object[]): Promise<ReplayResult> {
    return this.replay(projections, async () => {
      const events = await this.eventStore.getEvents(streamId);
      return events;
    });
  }

  private async replay(
    projections: object[],
    loadEvents: () => Promise<StoredEvent[]>,
  ): Promise<ReplayResult> {
    const start = Date.now();
    const errors: ReplayResult['errors'] = [];
    const projectionCounts: Record<string, number> = {};

    // Build handler map: eventType → [{ projection, method }]
    const handlerMap = new Map<string, { projection: object; methodName: string; projectionName: string }[]>();

    for (const projection of projections) {
      const proto = Object.getPrototypeOf(projection);
      const entries: { eventTypeName: string; methodName: string }[] =
        Reflect.getMetadata(ON_DOMAIN_EVENT_METADATA, proto) ?? [];

      const projectionName = projection.constructor.name;
      projectionCounts[projectionName] = 0;

      for (const entry of entries) {
        const typeName = entry.eventTypeName;
        const existing = handlerMap.get(typeName) ?? [];
        existing.push({ projection, methodName: entry.methodName as string, projectionName });
        handlerMap.set(typeName, existing);
      }
    }

    const events = await loadEvents();
    this.logger.log(`Replaying ${events.length} events through ${projections.length} projection(s)`);

    for (const event of events) {
      const handlers = handlerMap.get(event.type);
      if (!handlers) continue;

      for (const { projection, methodName, projectionName } of handlers) {
        try {
           
          await (projection as any)[methodName](event);
          projectionCounts[projectionName]++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          errors.push({ position: event.position, type: event.type, error: errorMsg });
          this.logger.warn(`Replay error at position ${event.position} (${event.type}): ${errorMsg}`);
        }
      }
    }

    const durationMs = Date.now() - start;
    this.logger.log(`Replay complete: ${events.length} events in ${durationMs}ms, ${errors.length} errors`);

    return {
      eventsProcessed: events.length,
      durationMs,
      projectionCounts,
      errors,
    };
  }
}
