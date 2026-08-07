import { describe, it, expect, vi } from 'vitest';
import {
  createContract,
  type ContractType,
  provideContract,
  provideContractFactory,
  InjectContract,
  validateContracts,
} from '../../src/contracts';

// ---- Test interface ----
interface IGreeter {
  greet(name: string): string;
}

describe('Contracts (interface-based DI)', () => {
  describe('createContract', () => {
    it('should return a contract with a unique symbol token and name', () => {
      const contract = createContract<IGreeter>('IGreeter');
      expect(typeof contract.token).toBe('symbol');
      expect(contract.token.toString()).toBe('Symbol(IGreeter)');
      expect(contract.name).toBe('IGreeter');
    });

    it('should produce distinct tokens for different names', () => {
      const a = createContract<IGreeter>('A');
      const b = createContract<IGreeter>('B');
      expect(a.token).not.toBe(b.token);
    });
  });

  describe('ContractType', () => {
    it('should extract the interface type at compile time', () => {
      const contract = createContract<IGreeter>('IGreeter');
      // This is a compile-time check — if ContractType is wrong, tsc will fail.
      // At runtime we just verify the contract object shape is correct.
      type Extracted = ContractType<typeof contract>;
      const impl: Extracted = { greet: (name: string) => `Hi ${name}` };
      expect(impl.greet('world')).toBe('Hi world');
    });
  });

  describe('provideContract', () => {
    it('should create a useExisting provider with the contract token', () => {
      const contract = createContract<IGreeter>('IGreeter');
      class GreeterService {
        greet(name: string) { return `Hello ${name}`; }
      }
      const provider = provideContract(contract, GreeterService) as any;
      expect(provider.provide).toBe(contract.token);
      expect(provider.useExisting).toBe(GreeterService);
    });
  });

  describe('provideContractFactory', () => {
    it('should create a useFactory provider with the contract token', () => {
      const contract = createContract<IGreeter>('IGreeter');
      const factory = () => ({ greet: (n: string) => n });
      const provider = provideContractFactory(contract, factory, ['dep1']) as any;
      expect(provider.provide).toBe(contract.token);
      expect(provider.useFactory).toBe(factory);
      expect(provider.inject).toEqual(['dep1']);
    });
  });

  describe('InjectContract', () => {
    it('should return a parameter decorator that uses the contract token', () => {
      const contract = createContract<IGreeter>('IGreeter');
      // InjectContract delegates to @Inject(token). We verify it returns a function (decorator).
      const decorator = InjectContract(contract);
      expect(typeof decorator).toBe('function');
    });
  });

  describe('validateContracts', () => {
    it('should warn on missing provider', () => {
      const contract = createContract<IGreeter>('IMissing');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const fakeApp = {
        get: (_token: any) => { throw new Error('not found'); },
      } as any;

      validateContracts(fakeApp, [contract]);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain('IMissing');
      warnSpy.mockRestore();
    });

    it('should not warn when provider exists', () => {
      const contract = createContract<IGreeter>('IPresent');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const fakeApp = {
        get: (_token: any) => ({ greet: () => 'hi' }),
      } as any;

      validateContracts(fakeApp, [contract]);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
