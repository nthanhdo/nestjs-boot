/**
 * Contract Verifier — checks that a NestJS service class implements
 * all methods defined in a contract.
 *
 * Supports Zod-style or Joi-style schemas (anything with a `.parse()` or `.validate()` method).
 *
 * ```ts
 * const result = ContractVerifier.verify(UserService, {
 *   methods: [
 *     { name: 'findOne', input: z.object({ id: z.string() }), output: z.object({ id: z.string(), name: z.string() }) },
 *   ],
 * });
 * // result.pass === true if UserService.prototype.findOne exists
 * ```
 */

export interface SchemaLike {
  parse?: (data: unknown) => unknown;
  validate?: (data: unknown) => { error?: unknown; value?: unknown };
}

export interface ContractMethod {
  name: string;
  input: SchemaLike;
  output: SchemaLike;
}

export interface ContractDefinition {
  methods: ContractMethod[];
}

export interface VerificationResult {
  pass: boolean;
  violations: string[];
}

export class ContractVerifier {
  /**
   * Verify that `serviceClass` implements every method in the contract.
   *
   * Checks:
   * 1. Method exists on the prototype
   * 2. Method is a function
   */
  static verify(
    serviceClass: new (...args: unknown[]) => unknown,
    contract: ContractDefinition,
  ): VerificationResult {
    const violations: string[] = [];
    const proto = serviceClass.prototype;

    for (const method of contract.methods) {
      if (!(method.name in proto)) {
        violations.push(
          `Missing method: "${method.name}" is defined in contract but not found on ${serviceClass.name}.prototype`,
        );
        continue;
      }

      if (typeof proto[method.name] !== 'function') {
        violations.push(
          `Not a function: "${method.name}" exists on ${serviceClass.name}.prototype but is not a function`,
        );
      }
    }

    return {
      pass: violations.length === 0,
      violations,
    };
  }
}
