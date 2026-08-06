import { Inject } from '@nestjs/common';
import { getWriterToken, getReaderToken } from './constants';

/**
 * Inject a raw Mongoose connection by name and type.
 *
 * @param connectionName - The connection name from config (e.g., 'master')
 * @param type - 'writer' (default) or 'reader'
 *
 * For model injection, use standard `@nestjs/mongoose`:
 * ```ts
 * MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }], getWriterConnectionName('master'))
 * // then inject with:
 * @InjectModel(Product.name, getWriterConnectionName('master'))
 * ```
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
