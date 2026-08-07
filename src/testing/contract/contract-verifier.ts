/**
 * Contract Verifier — checks that a NestJS service class implements
 * all methods defined in a contract, with optional schema validation.
 *
 * Supports Zod-style or Joi-style schemas (anything with a `.parse()` or `.validate()` method).
 *
 * Level 1 (class-level): Verify method existence on prototype
 * Level 2 (instance-level): Actually CALL methods with test data and validate response shape
 *
 * ```ts
 * // Level 1: class check
 * const result = ContractVerifier.verify(UserService, {
 *   methods: [
 *     { name: 'findOne', input: z.object({ id: z.string() }), output: z.object({ id: z.string(), name: z.string() }) },
 *   ],
 * });
 *
 * // Level 2: instance check with real calls
 * const result = await ContractVerifier.verifyInstance(userService, {
 *   methods: [
 *     { name: 'findOne', testInput: { id: '123' }, output: z.object({ id: z.string(), name: z.string() }) },
 *   ],
 * });
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
  /** Test data to pass when calling the method (for verifyInstance) */
  testInput?: unknown;
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

  /**
   * Verify a service INSTANCE by actually calling methods with test data
   * and validating response shapes against output schemas.
   *
   * ```ts
   * const result = await ContractVerifier.verifyInstance(userService, {
   *   methods: [
   *     { name: 'findOne', testInput: { id: '507f1f77bcf86cd799439011' }, output: userSchema },
   *   ],
   * });
   * ```
   */
  static async verifyInstance(
    serviceInstance: Record<string, any>,
    contract: ContractDefinition,
  ): Promise<VerificationResult> {
    const violations: string[] = [];
    const className = serviceInstance.constructor?.name || 'Unknown';

    for (const method of contract.methods) {
      // Check method exists
      if (typeof serviceInstance[method.name] !== 'function') {
        violations.push(
          `Missing method: "${method.name}" is not a function on ${className} instance`,
        );
        continue;
      }

      // Validate input against input schema (if testInput provided)
      if (method.testInput !== undefined && method.input) {
        const inputError = validateWithSchema(method.input, method.testInput);
        if (inputError) {
          violations.push(
            `Input validation failed for "${method.name}": ${inputError}`,
          );
          continue;
        }
      }

      // Call the method with test data
      if (method.testInput !== undefined) {
        try {
          const args = Array.isArray(method.testInput) ? method.testInput : [method.testInput];
          const result = await serviceInstance[method.name](...args);

          // Validate output against output schema
          if (method.output && result !== null && result !== undefined) {
            const outputError = validateWithSchema(method.output, result);
            if (outputError) {
              violations.push(
                `Output validation failed for "${method.name}": ${outputError}`,
              );
            }
          }
        } catch (err: any) {
          violations.push(
            `Method "${method.name}" threw: ${err?.message || String(err)}`,
          );
        }
      }
    }

    return {
      pass: violations.length === 0,
      violations,
    };
  }
}

/**
 * Validate data against a Zod-style (.parse) or Joi-style (.validate) schema.
 * Returns an error message string, or null if valid.
 */
function validateWithSchema(schema: SchemaLike, data: unknown): string | null {
  if (typeof schema.parse === 'function') {
    try {
      schema.parse(data);
      return null;
    } catch (err: any) {
      return err?.message || 'Schema validation failed';
    }
  }

  if (typeof schema.validate === 'function') {
    const result = schema.validate(data);
    if (result.error) {
      return String(result.error);
    }
    return null;
  }

  return null;
}
