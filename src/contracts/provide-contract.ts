import type { Provider, Type } from '@nestjs/common';
import type { Contract } from './create-contract';

/**
 * Creates a provider that binds a contract to an existing class.
 *
 * @example
 * // In user.module.ts providers:
 * provideContract(IUserLookup, UserService)
 * // equivalent to: { provide: IUserLookup.token, useExisting: UserService }
 */
export function provideContract<T>(
  contract: Contract<T>,
  implementation: Type<T>,
): Provider {
  return { provide: contract.token, useExisting: implementation };
}

/**
 * Creates a provider that binds a contract to a factory function.
 *
 * @example
 * provideContractFactory(IConfig, () => loadConfig(), [ConfigService])
 */
export function provideContractFactory<T>(
  contract: Contract<T>,
  factory: (...args: any[]) => T,
  inject?: any[],
): Provider {
  return { provide: contract.token, useFactory: factory, inject };
}
