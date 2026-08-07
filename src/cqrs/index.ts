// --- Module ---
export { CqrsModule } from './cqrs.module';

// --- Command Bus ---
export { CommandBus, CommandHandler, ICommand, ICommandHandler, COMMAND_HANDLER_METADATA } from './command-bus';

// --- Domain Events ---
export { DomainEvent } from './domain-event';
export type { StoredEvent } from './domain-event';

// --- Aggregate Root ---
export { AggregateRoot } from './aggregate-root';

// --- Interfaces ---
export type { EventStore, SnapshotStore, CqrsOptions } from './interfaces';
export { ConcurrencyError } from './interfaces';

// --- Adapters ---
export { MemoryEventStore, MongoDBEventStore, MemorySnapshotStore, MongoDBSnapshotStore } from './adapters';

// --- Decorators ---
export { Projection, OnDomainEvent, PROJECTION_METADATA, ON_DOMAIN_EVENT_METADATA } from './decorators';

// --- Replay ---
export { EventReplayService } from './event-replay.service';
export type { ReplayResult } from './event-replay.service';

// --- Outbox ---
export { OutboxProcessor } from './outbox-processor';
export type { OutboxEntry } from './outbox-processor';

// --- Saga ---
export { defineSaga, SagaRunner, SagaBuilder } from './saga';
export type { SagaStep, SagaDefinition, SagaResult } from './saga';

// --- Constants ---
export {
  CQRS_OPTIONS,
  CQRS_EVENT_STORE,
  CQRS_SNAPSHOT_STORE,
  CQRS_COMMAND_BUS,
  CQRS_REPLAY_SERVICE,
  CQRS_OUTBOX_PROCESSOR,
} from './constants';
