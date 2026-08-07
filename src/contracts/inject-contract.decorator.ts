import { Inject } from '@nestjs/common';
import type { Contract } from './create-contract';

/**
 * Parameter decorator — inject a contract-based dependency.
 *
 * @example
 * constructor(@InjectContract(IUserLookup) private user: ContractType<typeof IUserLookup>) {}
 */
export function InjectContract<T>(contract: Contract<T>): ParameterDecorator {
  return Inject(contract.token);
}
