import { Inject } from '@nestjs/common';
import { getModelToken, getWriterToken, getReaderToken } from './constants';

/**
 * Inject a BaseRepository for a given model and connection.
 *
 * @param model - The Mongoose model name (e.g., 'Product')
 * @param connectionName - The connection name from config (e.g., 'master')
 */
export function InjectRepository(model: string, connectionName: string): ParameterDecorator {
  return Inject(getModelToken(model, connectionName));
}

/**
 * Inject a raw Mongoose connection by name and type.
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
