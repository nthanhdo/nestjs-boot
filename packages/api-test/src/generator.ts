import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzePayload } from './analyzer.js';
import { generateContractTests } from './methods/contract.js';
import { generateRegressionTests } from './methods/regression.js';
import { generateSmokeTests } from './methods/smoke.js';
import { generateStatusCodeTests } from './methods/status-codes.js';
import type { MethodCategory } from './methods/index.js';
import { getMutationModules } from './mutations/index.js';
import type { ApiTestConfig, MutationCategory, RecordedResponse, TestCase, TestSuite } from './types.js';
import { ensureDir, getColors, pathSlug } from './utils.js';

export function generateTestSuite(
  config: ApiTestConfig,
  recording: RecordedResponse,
  categories: MutationCategory[],
  methods: MethodCategory[] = [],
  allRecordings: RecordedResponse[] = [],
): TestSuite {
  const schema = analyzePayload(recording.endpoint.body);
  const modules = getMutationModules(categories);
  const testCases: TestCase[] = modules.flatMap(m => m.generate(recording.endpoint, recording, schema, config));

  // Method-based test generation
  const outputDir = config.outputDir || './api-tests';

  if (methods.includes('contract')) {
    testCases.push(...generateContractTests(recording.endpoint, recording, config));
  }
  if (methods.includes('status-codes')) {
    testCases.push(...generateStatusCodeTests(recording.endpoint, recording, config));
  }

  // Deduplicate by ID
  const seen = new Set<string>();
  const unique = testCases.filter(tc => {
    if (seen.has(tc.id)) return false;
    seen.add(tc.id);
    return true;
  });

  return {
    endpoint: recording.endpoint,
    happyCase: recording,
    testCases: unique,
  };
}

export function generateAll(
  config: ApiTestConfig,
  recordings: RecordedResponse[],
): TestSuite[] {
  const c = getColors();
  const categories = config.categories || ['auth', 'body', 'params', 'headers', 'edge', 'method'];
  const methods: MethodCategory[] = config.methods || [];
  const outputDir = config.outputDir || './api-tests';
  const suites: TestSuite[] = [];

  console.log(c.bold('Generating test cases...\n'));

  // Generate smoke and regression tests (operate across all recordings)
  let smokeTests: TestCase[] = [];
  let regressionTests: TestCase[] = [];
  if (methods.includes('smoke')) {
    smokeTests = generateSmokeTests(recordings, config);
  }
  if (methods.includes('regression')) {
    regressionTests = generateRegressionTests(recordings, config, outputDir);
  }

  for (const recording of recordings) {
    if (recording.status === 0) continue; // skip failed recordings

    const suite = generateTestSuite(config, recording, categories, methods, recordings);

    // Attach smoke/regression tests for this endpoint
    const ep = recording.endpoint;
    for (const st of smokeTests) {
      if (st.request.url === suite.testCases.find(t => t.mutation.includes('Replay'))?.request.url
        || st.name.includes(ep.path)) {
        suite.testCases.push(st);
      }
    }
    for (const rt of regressionTests) {
      if (rt.name.includes(ep.path)) {
        suite.testCases.push(rt);
      }
    }
    suites.push(suite);

    const slug = pathSlug(recording.endpoint);
    const filePath = join(outputDir, 'generated', `${slug}.test.json`);
    ensureDir(filePath);
    writeFileSync(filePath, JSON.stringify(suite, null, 2));

    console.log(`  ${c.cyan(slug)} — ${c.bold(String(suite.testCases.length))} test cases`);
  }

  const total = suites.reduce((sum, s) => sum + s.testCases.length, 0);
  console.log(`\n${c.green('✓')} Generated ${total} test cases across ${suites.length} endpoints\n`);

  // Save config
  const configPath = join(outputDir, 'config.json');
  ensureDir(configPath);
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  return suites;
}
