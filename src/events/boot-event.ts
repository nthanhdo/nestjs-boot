/**
 * Base class for all typed events in the event bus.
 * Automatically captures timestamp and correlationId from AsyncLocalStorage.
 */
export abstract class BootEvent {
  readonly timestamp = new Date();
  readonly correlationId?: string;

  constructor() {
    try {
      const { getCorrelationId } = require('../correlation/correlation.storage');
      this.correlationId = getCorrelationId();
    } catch {
      // correlation module not loaded — skip
    }
  }
}
