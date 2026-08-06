/**
 * Injection token prefix for all database connections.
 */
export const DATABASE_CONNECTION_PREFIX = 'BOOT_DB_';

/**
 * Get the injection token for a writer connection.
 */
export function getWriterToken(name: string): string {
  return `${DATABASE_CONNECTION_PREFIX}${name.toUpperCase()}_WRITER`;
}

/**
 * Get the injection token for a reader connection.
 */
export function getReaderToken(name: string): string {
  return `${DATABASE_CONNECTION_PREFIX}${name.toUpperCase()}_READER`;
}

/**
 * Get the writer connection name for MongooseModule.forRootAsync.
 */
export function getWriterConnectionName(name: string): string {
  return `${name}_writer`;
}

/**
 * Get the reader connection name for MongooseModule.forRootAsync.
 */
export function getReaderConnectionName(name: string): string {
  return `${name}_reader`;
}
