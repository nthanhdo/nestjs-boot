import type { INestApplication } from '@nestjs/common';
import type { Contract } from './create-contract';

/**
 * Validates that all registered contracts have providers bound.
 * Call after NestFactory.create() in dev mode for early detection of missing bindings.
 *
 * @example
 * const app = await NestFactory.create(AppModule);
 * validateContracts(app, [IUserLookup, IOrderService]);
 */
export function validateContracts(
  app: INestApplication,
  contracts: Contract<any>[],
): void {
  for (const contract of contracts) {
    try {
      app.get(contract.token);
    } catch {
      console.warn(
        `[nestjs-boot] Contract "${contract.name}" has no provider. ` +
          `Add provideContract(${contract.name}, YourService) to a module.`,
      );
    }
  }
}
