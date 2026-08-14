import type { INestApplication } from '@nestjs/common';
import { SwaggerOptions } from './interfaces';

/**
 * Read package.json from the consumer project root.
 */
function readPackageJson(): { name?: string; version?: string } {
  try {
     
    return require(`${process.cwd()}/package.json`);
  } catch {
    return {};
  }
}

/**
 * Attempt to load @nestjs/swagger. Returns null if not installed.
 * Keeps @nestjs/swagger as a soft optional dep — no crash if absent.
 */
function tryLoadSwagger(): any | null {
  try {
     
    return require('@nestjs/swagger');
  } catch {
    return null;
  }
}

/**
 * setupSwagger — wire @nestjs/swagger onto a NestJS app.
 *
 * - Reads package.json for default title/version.
 * - Only activates when enabled is true (default: true in dev, false in prod).
 * - Gracefully no-ops if @nestjs/swagger is not installed.
 * - Exposes JSON spec at `{path}-json`.
 *
 * @param app       NestJS application instance
 * @param options   SwaggerOptions from BootOptions.swagger
 * @param hasAuth   Whether auth module is configured (for auto Bearer scheme)
 * @param _swagger  Override @nestjs/swagger module (used in tests only)
 */
export function setupSwagger(
  app: INestApplication,
  options: SwaggerOptions,
  hasAuth: boolean,
  _swagger?: any,
): void {
  const swagger = _swagger ?? tryLoadSwagger();
  if (!swagger) {
    try {
      const { Logger } = require('@nestjs/common');
      new Logger('nestjs-boot').warn(
        'Swagger configured but @nestjs/swagger is not installed. ' +
          'Run: npm install @nestjs/swagger',
      );
    } catch {
      // @nestjs/common also absent in test env — just skip logging
    }
    return;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const enabled = options.enabled ?? !isProd;

  if (!enabled) return;

  const pkg = readPackageJson();
  const path = options.path ?? '/api/docs';
  const title = options.title ?? pkg.name ?? 'API';
  const version = options.version ?? pkg.version ?? '1.0.0';
  const addAuth = options.auth ?? hasAuth;

  const {
    DocumentBuilder,
    SwaggerModule: NestSwaggerModule,
  } = swagger;

  let builder = new DocumentBuilder()
    .setTitle(title)
    .setVersion(version);

  if (options.description) {
    builder = builder.setDescription(options.description);
  }

  for (const server of options.servers ?? []) {
    builder = builder.addServer(server.url, server.description);
  }

  for (const tag of options.tags ?? []) {
    builder = builder.addTag(tag.name, tag.description);
  }

  if (addAuth) {
    builder = builder.addBearerAuth();
    builder = builder.addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'api-key');
  }

  const document = NestSwaggerModule.createDocument(app, builder.build());
  NestSwaggerModule.setup(path, app, document, {
    jsonDocumentUrl: `${path}-json`,
  });
}
