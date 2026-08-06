import { Inject } from '@nestjs/common';
import { TRANSPORT_CLIENT_PREFIX } from './constants';

/**
 * Get the injection token for a named transport client.
 */
export function getClientToken(name: string): string {
  return `${TRANSPORT_CLIENT_PREFIX}${name}`;
}

/**
 * Inject a named gRPC client proxy.
 * @param name - Client name as defined in TransportOptions.clients
 */
export function InjectGrpcClient(name: string): ParameterDecorator {
  return Inject(getClientToken(name));
}

/**
 * Inject a named transport client proxy (any transport type).
 * @param name - Client name as defined in TransportOptions.clients
 */
export function InjectClient(name: string): ParameterDecorator {
  return Inject(getClientToken(name));
}
