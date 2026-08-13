import type { ApiTestConfig, TestCase } from '../types.js';
import { buildHeaders, nextId } from '../utils.js';

export interface StateMachineConfig {
  resource: string;
  basePath: string;
  stateField: string;
  states: string[];
  transitions: StateTransition[];
  createPayload: any;
  initialState: string;
}

export interface StateTransition {
  from: string;
  to: string;
  method: string;
  path?: string;
  body?: any;
}

export interface StateMachineTestCase extends TestCase {
  /** Previous test case ID this depends on (for chained execution) */
  dependsOn?: string;
  /** Variable extraction from response (e.g., id from create) */
  extractVariables?: Record<string, string>;
  /** State machine metadata */
  stateMachine?: {
    resource: string;
    fromState: string;
    toState: string;
    transitionType: 'valid' | 'invalid' | 'self' | 'terminal';
  };
}

/**
 * Generate state machine test cases: valid transitions, invalid transitions,
 * self-transitions, and terminal state checks.
 */
export function generateStateMachineTests(
  smConfig: StateMachineConfig,
  apiConfig: ApiTestConfig,
): StateMachineTestCase[] {
  const { resource, basePath, stateField, states, transitions, createPayload, initialState } = smConfig;
  const tests: StateMachineTestCase[] = [];
  const base = apiConfig.host.replace(/\/+$/, '') + (apiConfig.basePath || '') + basePath;
  const headers = buildHeaders(apiConfig, { method: 'POST', path: basePath });

  // 1. Create resource (setup step)
  const createId = nextId('sm');
  tests.push({
    id: createId,
    name: `[${resource}] Create resource (initial state: ${initialState})`,
    category: 'edge' as TestCase['category'],
    description: `Create a ${resource} resource to use in state machine tests`,
    request: {
      method: 'POST',
      url: base,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: createPayload,
    },
    expect: { status: [200, 201] },
    mutation: `Create ${resource} with initial state ${initialState}`,
    extractVariables: { id: '$.id', _id: '$._id' },
  });

  // Build transition map for lookup
  const transitionMap = new Map<string, StateTransition[]>();
  for (const t of transitions) {
    const key = t.from;
    if (!transitionMap.has(key)) transitionMap.set(key, []);
    transitionMap.get(key)!.push(t);
  }

  // 2. Valid transitions
  let prevId = createId;
  for (const t of transitions) {
    const id = nextId('sm');
    const path = t.path || `${basePath}/{{id}}`;
    const url = apiConfig.host.replace(/\/+$/, '') + (apiConfig.basePath || '') + path;
    const body = t.body || { [stateField]: t.to };

    tests.push({
      id,
      name: `[${resource}] ${t.from} → ${t.to} (valid)`,
      category: 'edge' as TestCase['category'],
      description: `Valid transition: ${t.from} → ${t.to} via ${t.method}`,
      request: {
        method: t.method,
        url,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body,
      },
      expect: { status: [200, 204] },
      mutation: `Transition ${resource}.${stateField}: ${t.from} → ${t.to}`,
      dependsOn: prevId,
      stateMachine: {
        resource,
        fromState: t.from,
        toState: t.to,
        transitionType: 'valid',
      },
    });
    prevId = id;
  }

  // 3. Invalid transitions (not in the defined list)
  for (const fromState of states) {
    const validTargets = new Set(
      (transitionMap.get(fromState) || []).map(t => t.to),
    );

    for (const toState of states) {
      if (validTargets.has(toState)) continue;
      if (fromState === toState) continue; // self-transitions handled separately

      const id = nextId('sm');
      const url = `${base}/{{id}}`;

      tests.push({
        id,
        name: `[${resource}] ${fromState} → ${toState} (INVALID)`,
        category: 'edge' as TestCase['category'],
        description: `Invalid transition: ${fromState} → ${toState} should be rejected`,
        request: {
          method: 'PATCH',
          url,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: { [stateField]: toState },
        },
        expect: { status: [400, 422, 409] },
        mutation: `Invalid transition ${resource}.${stateField}: ${fromState} → ${toState}`,
        stateMachine: {
          resource,
          fromState,
          toState,
          transitionType: 'invalid',
        },
      });
    }
  }

  // 4. Self-transitions
  for (const state of states) {
    const id = nextId('sm');
    const url = `${base}/{{id}}`;

    tests.push({
      id,
      name: `[${resource}] ${state} → ${state} (self-transition)`,
      category: 'edge' as TestCase['category'],
      description: `Self-transition: ${state} → ${state}, test idempotency or rejection`,
      request: {
        method: 'PATCH',
        url,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: { [stateField]: state },
      },
      expect: { status: [200, 400, 422] },
      mutation: `Self-transition ${resource}.${stateField}: ${state} → ${state}`,
      stateMachine: {
        resource,
        fromState: state,
        toState: state,
        transitionType: 'self',
      },
    });
  }

  // 5. Terminal state tests (states with no outgoing transitions)
  const terminalStates = states.filter(s => !transitionMap.has(s) || transitionMap.get(s)!.length === 0);
  for (const state of terminalStates) {
    for (const target of states.filter(s => s !== state)) {
      const id = nextId('sm');
      const url = `${base}/{{id}}`;

      tests.push({
        id,
        name: `[${resource}] ${state} → ${target} (terminal, should fail)`,
        category: 'edge' as TestCase['category'],
        description: `Terminal state: ${state} has no outgoing transitions, ${state} → ${target} must fail`,
        request: {
          method: 'PATCH',
          url,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: { [stateField]: target },
        },
        expect: { status: [400, 422, 409] },
        mutation: `Terminal state violation: ${resource}.${stateField} at ${state}, attempted → ${target}`,
        stateMachine: {
          resource,
          fromState: state,
          toState: target,
          transitionType: 'terminal',
        },
      });
    }
  }

  return tests;
}
