import { SetMetadata } from '@nestjs/common';

export const LAYER_KEY = 'boot:module:layer';

export enum ModuleLayer {
  CORE = 0,
  INFRASTRUCTURE = 1,
  DOMAIN = 2,
  APPLICATION = 3,
}

/**
 * Decorator to assign a layer to a NestJS module.
 * Used by the Layer Enforcer to validate import direction.
 *
 * @example
 * @Layer(ModuleLayer.DOMAIN)
 * @Module({ imports: [DatabaseModule], providers: [OrderService] })
 * export class OrderModule {}
 */
export function Layer(layer: ModuleLayer): ClassDecorator {
  return SetMetadata(LAYER_KEY, layer);
}
