/**
 * Swagger/OpenAPI configuration options for nestjs-boot.
 */
export interface SwaggerOptions {
  /**
   * Enable Swagger UI.
   * Default: true in development, false in production.
   */
  enabled?: boolean;
  /** URL path for Swagger UI (default: '/api/docs') */
  path?: string;
  /** API title (default: package.json `name`) */
  title?: string;
  /** API description */
  description?: string;
  /** API version (default: package.json `version`) */
  version?: string;
  /** Server list shown in the Swagger UI "Servers" dropdown */
  servers?: Array<{ url: string; description?: string }>;
  /**
   * Auto-add Bearer + ApiKey security schemes.
   * Default: true when auth module is configured in BootOptions.
   */
  auth?: boolean;
  /** Tag groups shown in Swagger UI sidebar */
  tags?: Array<{ name: string; description?: string }>;
}
