import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffBaseline, loadBaseline } from './methods/regression.js';
import type { ContractSchema } from './methods/contract.js';
import type { RegressionTestCase } from './methods/regression.js';
import type { TestCase, TestResult, TestSuite } from './types.js';
import { apiFetch, getColors } from './utils.js';

interface RunOptions {
  filter?: {
    category?: string;
    endpoint?: string;
  };
  bail?: boolean;
  concurrency?: number;
  suiteDir?: string;
}

export async function runTestCase(testCase: TestCase): Promise<TestResult> {
  try {
    const result = await apiFetch(
      testCase.request.url,
      testCase.request.method,
      testCase.request.headers,
      testCase.request.body,
    );

    const expectedStatuses = Array.isArray(testCase.expect.status)
      ? testCase.expect.status
      : [testCase.expect.status];

    let passed = expectedStatuses.includes(result.status);
    let reason: string | undefined;

    if (!passed) {
      reason = `Expected status ${expectedStatuses.join('|')}, got ${result.status}`;
    }

    // Body contains checks
    if (passed && testCase.expect.bodyContains) {
      const bodyStr = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
      for (const needle of testCase.expect.bodyContains) {
        if (!bodyStr.includes(needle)) {
          passed = false;
          reason = `Body missing expected string: "${needle}"`;
          break;
        }
      }
    }

    // Schema validation (contract tests)
    const expectAny = testCase.expect as TestCase['expect'] & { schema?: ContractSchema; baselineMatch?: boolean };
    if (passed && expectAny.schema) {
      const schemaErrors = validateSchema(result.body, expectAny.schema);
      if (schemaErrors.length > 0) {
        passed = false;
        reason = `Schema mismatch: ${schemaErrors[0]}`;
      }
    }

    // Baseline diff (regression tests)
    if (passed && expectAny.baselineMatch) {
      const regCase = testCase as RegressionTestCase;
      if (regCase.baselinePath) {
        try {
          const baseline = JSON.parse(readFileSync(regCase.baselinePath, 'utf-8'));
          const diff = diffBaseline(baseline, result.body, result.status);
          if (!diff.passed) {
            passed = false;
            reason = `Regression: ${diff.diffs[0]}`;
          }
        } catch {
          // No baseline file — skip
        }
      }
    }

    // Body not-contains checks (security)
    if (passed && testCase.expect.bodyNotContains) {
      const bodyStr = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
      for (const needle of testCase.expect.bodyNotContains) {
        if (bodyStr.toLowerCase().includes(needle.toLowerCase())) {
          passed = false;
          reason = `Body contains forbidden string: "${needle}"`;
          break;
        }
      }
    }

    return {
      testCase,
      actual: {
        status: result.status,
        body: result.body,
        headers: result.headers,
        duration: result.duration,
      },
      passed,
      reason,
    };
  } catch (err) {
    return {
      testCase,
      actual: { status: 0, body: null, headers: {}, duration: 0 },
      passed: false,
      reason: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function runSuites(suites: TestSuite[], options: RunOptions = {}): Promise<TestResult[]> {
  const c = getColors();
  const results: TestResult[] = [];
  let failed = false;

  console.log(c.bold('\nRunning test cases...\n'));

  for (const suite of suites) {
    let cases = suite.testCases;

    if (options.filter?.category) {
      cases = cases.filter(tc => tc.category === options.filter!.category);
    }
    if (options.filter?.endpoint) {
      cases = cases.filter(tc => tc.request.url.includes(options.filter!.endpoint!));
    }

    if (cases.length === 0) continue;

    const label = `${suite.endpoint.method} ${suite.endpoint.path}`;
    console.log(c.bold(`  ${label} (${cases.length} cases)`));

    for (const tc of cases) {
      if (failed && options.bail) break;

      const result = await runTestCase(tc);
      results.push(result);

      const icon = result.passed ? c.green('PASS') : c.red('FAIL');
      const detail = result.passed ? '' : ` — ${c.dim(result.reason || '')}`;
      console.log(`    ${icon} ${tc.name}${detail}`);

      if (!result.passed) failed = true;
    }

    if (failed && options.bail) {
      console.log(c.yellow('\n  Bailed after first failure.\n'));
      break;
    }
  }

  return results;
}

function validateSchema(body: unknown, schema: ContractSchema, path = '$'): string[] {
  const errors: string[] = [];

  if (schema.nullable && (body === null || body === undefined)) return errors;

  if (schema.type === 'object') {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      errors.push(`${path}: expected object, got ${Array.isArray(body) ? 'array' : typeof body}`);
      return errors;
    }
    const obj = body as Record<string, unknown>;

    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj)) {
          errors.push(`${path}: missing required field "${field}"`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, fieldSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          errors.push(...validateSchema(obj[key], fieldSchema, `${path}.${key}`));
        }
      }
    }

    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) {
          errors.push(`${path}: unexpected field "${key}"`);
        }
      }
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(body)) {
      errors.push(`${path}: expected array, got ${typeof body}`);
    } else if (schema.items && body.length > 0) {
      errors.push(...validateSchema(body[0], schema.items, `${path}[0]`));
    }
  } else {
    const actualType = body === null ? 'null' : typeof body;
    if (actualType !== schema.type) {
      errors.push(`${path}: expected ${schema.type}, got ${actualType}`);
    }
  }

  return errors;
}

export function loadSuites(dir: string): TestSuite[] {
  const genDir = join(dir, 'generated');
  try {
    const files = readdirSync(genDir).filter(f => f.endsWith('.test.json'));
    return files.map(f => JSON.parse(readFileSync(join(genDir, f), 'utf-8')));
  } catch {
    return [];
  }
}
