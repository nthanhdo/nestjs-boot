import { Inject } from '@nestjs/common';
import { getWriterToken, getReaderToken } from './constants';

/**
 * Inject a raw database connection by name and type.
 *
 * @param connectionName - The connection name from config (e.g., 'master')
 * @param type - 'writer' (default) or 'reader'
 */
export function InjectConnection(
  connectionName: string,
  type: 'writer' | 'reader' = 'writer',
): ParameterDecorator {
  const token = type === 'reader'
    ? getReaderToken(connectionName)
    : getWriterToken(connectionName);
  return Inject(token);
}
