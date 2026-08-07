import { SnapshotStore } from '../interfaces';

/**
 * In-memory SnapshotStore implementation.
 * Suitable for testing and development.
 */
export class MemorySnapshotStore implements SnapshotStore {
  private readonly snapshots = new Map<string, { version: number; state: unknown }>();

  async save(streamId: string, version: number, state: unknown): Promise<void> {
    this.snapshots.set(streamId, { version, state });
  }

  async load(streamId: string): Promise<{ version: number; state: unknown } | null> {
    return this.snapshots.get(streamId) ?? null;
  }

  /** @internal — for testing */
  clear(): void {
    this.snapshots.clear();
  }
}
