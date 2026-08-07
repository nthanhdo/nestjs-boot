import { INestApplication } from '@nestjs/common';

/**
 * Test dispatcher for @MessagePattern and @EventPattern handlers.
 * Invokes handlers in-process without a real message broker.
 */
export interface MessageDispatcher {
  /**
   * Send a message to a @MessagePattern handler and return the response.
   */
  send<R = any>(pattern: string, data: any): Promise<R>;

  /**
   * Emit an event to matching @EventPattern handlers (fire-and-forget).
   */
  emit(pattern: string, data: any): Promise<void>;
}

interface HandlerEntry {
  instance: any;
  methodName: string;
  type: 'message' | 'event';
}

/**
 * Create a message dispatcher that invokes @MessagePattern and @EventPattern
 * handlers directly through the NestJS DI container — no real broker needed.
 *
 * Scans all controllers in the app for decorated handlers.
 */
export function createMessageDispatcher(app: INestApplication): MessageDispatcher {
  const handlerMap = new Map<string, HandlerEntry[]>();
  const discoveredInstances: any[] = [];

  // Access NestJS internal container to discover controllers and providers
  try {
    const container = (app as any).container;
    if (container) {
      const modules = container.getModules();
      for (const [, moduleWrapper] of modules) {
        for (const [, controllerWrapper] of moduleWrapper.controllers) {
          if (controllerWrapper.instance) {
            discoveredInstances.push(controllerWrapper.instance);
          }
        }
        for (const [, providerWrapper] of moduleWrapper.providers) {
          if (providerWrapper?.instance && typeof providerWrapper.instance === 'object') {
            discoveredInstances.push(providerWrapper.instance);
          }
        }
      }
    }
  } catch {
    // Container access may differ across NestJS versions
  }

  // Scan for @MessagePattern / @EventPattern metadata
  for (const instance of discoveredInstances) {
    if (!instance || typeof instance !== 'object') continue;
    const proto = Object.getPrototypeOf(instance);
    if (!proto) continue;

    let methodNames: string[];
    try {
      methodNames = Object.getOwnPropertyNames(proto).filter((m) => {
        if (m === 'constructor') return false;
        try {
          return typeof proto[m] === 'function';
        } catch {
          return false; // skip getters that throw
        }
      });
    } catch {
      continue;
    }

    for (const methodName of methodNames) {
      const msgPattern = Reflect.getMetadata('microservices:pattern', proto[methodName]);
      const handlerType = Reflect.getMetadata('microservices:handler_type', proto[methodName]);

      if (msgPattern !== undefined) {
        const patterns = Array.isArray(msgPattern) ? msgPattern : [msgPattern];
        for (const p of patterns) {
          const key = typeof p === 'string' ? p : JSON.stringify(p);
          const type = handlerType === 1 ? 'event' : 'message';
          if (!handlerMap.has(key)) handlerMap.set(key, []);
          handlerMap.get(key)!.push({ instance, methodName, type });
        }
      }
    }
  }

  return {
    async send<R = any>(pattern: string, data: any): Promise<R> {
      const entries = handlerMap.get(pattern);
      if (!entries || entries.length === 0) {
        throw new Error(
          `[nestjs-boot] MessageDispatcher: No handler found for pattern "${pattern}". ` +
          `Registered patterns: ${[...handlerMap.keys()].join(', ') || 'none'}`,
        );
      }
      const handler = entries.find((e) => e.type === 'message') ?? entries[0];
      return await handler.instance[handler.methodName](data) as R;
    },

    async emit(pattern: string, data: any): Promise<void> {
      const entries = handlerMap.get(pattern);
      if (!entries || entries.length === 0) {
        throw new Error(
          `[nestjs-boot] MessageDispatcher: No handler found for pattern "${pattern}". ` +
          `Registered patterns: ${[...handlerMap.keys()].join(', ') || 'none'}`,
        );
      }
      await Promise.all(entries.map((e) => e.instance[e.methodName](data)));
    },
  };
}
