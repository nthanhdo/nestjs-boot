/**
 * AutoApiProperties — auto-generate Swagger `@ApiProperty()` decorators
 * from class-validator metadata on a DTO class.
 *
 * Reads `@IsString()`, `@IsNumber()`, `@IsBoolean()`, `@IsOptional()` etc.
 * from class-validator and emits equivalent `@ApiProperty()` annotations so
 * you don't need to duplicate every field with both a validator and a Swagger
 * decorator.
 *
 * Usage:
 * ```ts
 * @AutoApiProperties()
 * export class CreateProductDto {
 *   @IsString()
 *   name: string;
 *
 *   @IsNumber()
 *   @IsOptional()
 *   price?: number;
 * }
 * ```
 *
 * Gracefully no-ops when @nestjs/swagger or class-validator are absent.
 */
export function AutoApiProperties(): ClassDecorator {
  let swagger: any;

  try {
     
    swagger = require('@nestjs/swagger');
  } catch {
    return (_target: any) => {};
  }

  try {
     
    require('class-validator');
  } catch {
    // class-validator absent — nothing to introspect
    return (_target: any) => {};
  }

  return (target: any) => {
    // class-validator stores metadata via reflect-metadata under this key
    const metadataKey = 'class-validator:constraints';
    const constraints: Map<string, any[]> =
      Reflect.getMetadata(metadataKey, target.prototype) ?? new Map();

    for (const [propertyKey, rules] of constraints) {
      const ruleNames = rules.map((r: any) => r.name ?? r.constructor?.name ?? '');
      const isOptional = ruleNames.some((n: string) =>
        ['IsOptional', 'conditionalValidation'].includes(n),
      );

      let type: string | undefined;
      if (ruleNames.some((n: string) => n === 'IsString' || n === 'IsUrl' || n === 'IsEmail')) {
        type = 'string';
      } else if (ruleNames.some((n: string) => n === 'IsNumber' || n === 'IsInt')) {
        type = 'number';
      } else if (ruleNames.some((n: string) => n === 'IsBoolean')) {
        type = 'boolean';
      } else if (ruleNames.some((n: string) => n === 'IsArray')) {
        type = 'array';
      }

      // Only apply if we inferred a type (avoids cluttering complex types)
      if (type) {
        swagger.ApiProperty({ type, required: !isOptional })(
          target.prototype,
          propertyKey,
        );
      }
    }
  };
}
