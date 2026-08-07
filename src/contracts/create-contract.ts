/**
 * Creates a typed injection token for interface-based dependency injection.
 * Prevents circular dependencies by depending on contracts, not implementations.
 *
 * @example
 * // shared/contracts.ts (no module imports!)
 * export const IUserLookup = createContract<{
 *   findById(id: string): Promise<User>;
 *   findByEmail(email: string): Promise<User | null>;
 * }>('IUserLookup');
 *
 * // order.service.ts — depends on contract, NOT UserModule
 * constructor(@InjectContract(IUserLookup) private user: ContractType<typeof IUserLookup>) {}
 *
 * // user.module.ts — provides implementation
 * providers: [UserService, provideContract(IUserLookup, UserService)]
 * exports: [IUserLookup.token]
 */
export function createContract<T>(name: string): Contract<T> {
  const token = Symbol(name);
  return {
    token,
    name,
    // TypeScript trick: _type is never used at runtime, only for type inference
    _type: undefined as unknown as T,
  };
}

export interface Contract<T> {
  token: symbol;
  name: string;
  /** Phantom property for type inference only — never accessed at runtime. */
  _type: T;
}

/** Extract the interface type from a Contract. */
export type ContractType<C> = C extends Contract<infer T> ? T : never;
