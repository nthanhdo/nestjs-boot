import type { ApiTestConfig, EndpointConfig, TestCase } from '../types.js';
import { buildHeaders, buildUrl, nextId } from '../utils.js';

export interface PairwiseParameter {
  field: string;
  values: any[];
  location: 'body' | 'query' | 'header' | 'param';
}

export interface PairwiseConfig {
  endpoint: EndpointConfig;
  parameters: PairwiseParameter[];
}

interface Pair {
  fieldA: number;
  valueA: number;
  fieldB: number;
  valueB: number;
}

/**
 * Generate all uncovered pairs from N fields.
 */
function getAllPairs(params: PairwiseParameter[]): Pair[] {
  const pairs: Pair[] = [];
  for (let a = 0; a < params.length; a++) {
    for (let b = a + 1; b < params.length; b++) {
      for (let va = 0; va < params[a].values.length; va++) {
        for (let vb = 0; vb < params[b].values.length; vb++) {
          pairs.push({ fieldA: a, valueA: va, fieldB: b, valueB: vb });
        }
      }
    }
  }
  return pairs;
}

/**
 * Check if a test case covers a pair.
 */
function covers(testCase: number[], pair: Pair): boolean {
  return testCase[pair.fieldA] === pair.valueA && testCase[pair.fieldB] === pair.valueB;
}

/**
 * Greedy all-pairs covering array algorithm.
 * Returns minimal-ish set of value-index tuples covering all 2-way combinations.
 */
export function generateCoveringArray(params: PairwiseParameter[]): number[][] {
  if (params.length === 0) return [];
  if (params.length === 1) return params[0].values.map((_, i) => [i]);

  const uncovered = getAllPairs(params);
  const covered = new Set<string>();
  const result: number[][] = [];

  const pairKey = (p: Pair) => `${p.fieldA}:${p.valueA}-${p.fieldB}:${p.valueB}`;

  while (covered.size < uncovered.length) {
    // Try each candidate row, pick the one that covers the most uncovered pairs
    let bestRow: number[] | null = null;
    let bestCount = -1;

    // Generate candidates: for each uncovered pair, build a row seeded by it
    const remaining = uncovered.filter(p => !covered.has(pairKey(p)));
    const seeds = remaining.slice(0, Math.min(remaining.length, 50)); // limit search

    for (const seed of seeds) {
      const row = new Array(params.length).fill(-1);
      row[seed.fieldA] = seed.valueA;
      row[seed.fieldB] = seed.valueB;

      // Fill remaining fields greedily
      for (let f = 0; f < params.length; f++) {
        if (row[f] !== -1) continue;
        let bestVal = 0;
        let bestValCount = -1;
        for (let v = 0; v < params[f].values.length; v++) {
          row[f] = v;
          const count = uncovered.filter(
            p => !covered.has(pairKey(p)) && covers(row, p),
          ).length;
          if (count > bestValCount) {
            bestValCount = count;
            bestVal = v;
          }
        }
        row[f] = bestVal;
      }

      const count = uncovered.filter(
        p => !covered.has(pairKey(p)) && covers(row, p),
      ).length;
      if (count > bestCount) {
        bestCount = count;
        bestRow = [...row];
      }
    }

    if (!bestRow || bestCount === 0) {
      // Fallback: fill remaining with first values
      const row = params.map(() => 0);
      for (const p of uncovered) {
        if (!covered.has(pairKey(p))) {
          row[p.fieldA] = p.valueA;
          row[p.fieldB] = p.valueB;
          break;
        }
      }
      bestRow = row;
    }

    // Mark covered pairs
    for (const p of uncovered) {
      if (covers(bestRow, p)) covered.add(pairKey(p));
    }
    result.push(bestRow);
  }

  return result;
}

/**
 * Apply a value-index tuple to an endpoint, producing a request config.
 */
function applyRow(
  row: number[],
  params: PairwiseParameter[],
  endpoint: EndpointConfig,
  config: ApiTestConfig,
): { url: string; headers: Record<string, string>; body?: unknown } {
  const ep = { ...endpoint };
  const body: Record<string, any> = ep.body && typeof ep.body === 'object' ? { ...(ep.body as any) } : {};
  const query: Record<string, string> = ep.query ? { ...ep.query } : {};
  const hdrs: Record<string, string> = {};
  const pathParams: Record<string, string> = ep.params ? { ...ep.params } : {};

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const value = param.values[row[i]];

    switch (param.location) {
      case 'body':
        body[param.field] = value;
        break;
      case 'query':
        query[param.field] = String(value);
        break;
      case 'header':
        hdrs[param.field] = String(value);
        break;
      case 'param':
        pathParams[param.field] = String(value);
        break;
    }
  }

  const modifiedEp: EndpointConfig = {
    ...ep,
    params: Object.keys(pathParams).length > 0 ? pathParams : undefined,
    query: Object.keys(query).length > 0 ? query : undefined,
    body: Object.keys(body).length > 0 ? body : ep.body,
  };

  const url = buildUrl(config, modifiedEp);
  const headers = { ...buildHeaders(config, modifiedEp), ...hdrs };
  const finalBody = Object.keys(body).length > 0 ? body : modifiedEp.body;

  return { url, headers, body: finalBody };
}

/**
 * Generate pairwise test cases from parameter definitions.
 */
export function generatePairwiseTests(
  pairwiseConfig: PairwiseConfig,
  config: ApiTestConfig,
): TestCase[] {
  const { endpoint, parameters } = pairwiseConfig;
  const rows = generateCoveringArray(parameters);

  return rows.map((row, idx) => {
    const combo = parameters.map((p, i) => `${p.field}=${JSON.stringify(p.values[row[i]])}`).join(', ');
    const { url, headers, body } = applyRow(row, parameters, endpoint, config);

    return {
      id: nextId('pairwise'),
      name: `Pairwise #${idx + 1}: ${combo}`,
      category: 'edge' as TestCase['category'],
      description: `Pairwise combination ${idx + 1}/${rows.length} for ${endpoint.method} ${endpoint.path}`,
      request: {
        method: endpoint.method,
        url,
        headers,
        body,
      },
      expect: { status: [200, 201, 400, 422] },
      mutation: `Pairwise: ${combo}`,
    };
  });
}
