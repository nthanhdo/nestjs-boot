import type { ApiTestConfig, EndpointConfig, TestCase } from '../types.js';
import { buildHeaders, buildUrl, nextId } from '../utils.js';

export interface FlowStep {
  name: string;
  method: string;
  path: string;
  body?: any;
  headers?: Record<string, string>;
  extract?: Record<string, string>;
  expect: { status: number | number[] };
}

export interface FlowConfig {
  name: string;
  steps: FlowStep[];
}

export interface FlowTestCase extends TestCase {
  dependsOn?: string;
  extractVariables?: Record<string, string>;
  flowName?: string;
  stepIndex?: number;
}

/**
 * Substitute `{{varName}}` placeholders in a string with values from the variables map.
 */
export function substituteVariables(input: string, variables: Record<string, string>): string {
  return input.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

/**
 * Deep-substitute variables in an object (body, headers, path).
 */
function substituteDeep(obj: unknown, variables: Record<string, string>): unknown {
  if (typeof obj === 'string') return substituteVariables(obj, variables);
  if (Array.isArray(obj)) return obj.map(item => substituteDeep(item, variables));
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[substituteVariables(k, variables)] = substituteDeep(v, variables);
    }
    return result;
  }
  return obj;
}

/**
 * Generate chained test cases from a multi-step flow definition.
 */
export function generateFlow(
  config: ApiTestConfig,
  flowConfig: FlowConfig,
): FlowTestCase[] {
  const cases: FlowTestCase[] = [];
  let previousId: string | undefined;

  for (let i = 0; i < flowConfig.steps.length; i++) {
    const step = flowConfig.steps[i];
    const endpoint: EndpointConfig = {
      method: step.method as any,
      path: step.path,
    };

    const url = buildUrl(config, endpoint);
    const baseHeaders = buildHeaders(config, endpoint);
    const mergedHeaders = { ...baseHeaders, ...(step.headers ?? {}) };

    if (step.body) {
      mergedHeaders['Content-Type'] = mergedHeaders['Content-Type'] || 'application/json';
    }

    const id = nextId('flow');
    const tc: FlowTestCase = {
      id,
      name: `${flowConfig.name} — ${i + 1}. ${step.name}`,
      category: 'flow',
      description: `${step.method} ${step.path} — ${step.name}`,
      request: {
        method: step.method,
        url,
        headers: mergedHeaders,
        body: step.body,
      },
      expect: {
        status: step.expect.status,
      },
      mutation: `Flow step: ${step.name}`,
      flowName: flowConfig.name,
      stepIndex: i,
    };

    if (previousId) {
      tc.dependsOn = previousId;
    }

    if (step.extract) {
      tc.extractVariables = step.extract;
    }

    cases.push(tc);
    previousId = id;
  }

  return cases;
}
