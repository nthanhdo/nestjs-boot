import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateAll } from './generator.js';
import { recordAll } from './recorder.js';
import { reportConsole, reportHtml, reportJson } from './reporter.js';
import { loadSuites, runSuites } from './runner.js';
import type { ApiTestConfig } from './types.js';
import { ensureDir, getColors } from './utils.js';
import { runWizard } from './wizard.js';

export async function run(args: string[]): Promise<void> {
  const c = getColors();
  const command = args[0] || 'generate';

  const configFlag = args.indexOf('--config');
  const configPath = configFlag >= 0 && args[configFlag + 1]
    ? resolve(args[configFlag + 1])
    : resolve('./api-tests/config.json');

  const reportFlag = args.indexOf('--report');
  const reportFormat = reportFlag >= 0 ? args[reportFlag + 1] : undefined;

  const filterCat = args.indexOf('--filter');
  const filterValue = filterCat >= 0 ? args[filterCat + 1] : undefined;

  const bail = args.includes('--bail');

  switch (command) {
    case 'generate': {
      const config = await runWizard();
      if (!config) return;
      await executeGenerateFlow(config);
      break;
    }

    case 'run': {
      if (!existsSync(configPath)) {
        console.log(c.red(`Config not found at ${configPath}. Run 'api-test generate' first.`));
        process.exit(1);
      }
      const config: ApiTestConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      const outputDir = config.outputDir || './api-tests';
      const suites = loadSuites(outputDir);
      if (suites.length === 0) {
        console.log(c.red('No test suites found. Run "api-test generate" first.'));
        process.exit(1);
      }

      const results = await runSuites(suites, {
        bail,
        filter: filterValue ? { category: filterValue } : undefined,
      });

      reportConsole(results);
      const jsonPath = reportJson(results, outputDir);
      console.log(`  ${c.dim('JSON report:')} ${jsonPath}`);

      if (reportFormat === 'html') {
        const htmlPath = reportHtml(results, outputDir);
        console.log(`  ${c.dim('HTML report:')} ${htmlPath}`);
      }
      break;
    }

    case 'update': {
      if (!existsSync(configPath)) {
        console.log(c.red(`Config not found at ${configPath}.`));
        process.exit(1);
      }
      const config: ApiTestConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      console.log(c.bold('Re-recording and regenerating...\n'));
      await executeGenerateFlow(config);
      break;
    }

    case 'add': {
      let existingConfig: ApiTestConfig | undefined;
      if (existsSync(configPath)) {
        existingConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      }
      const config = await runWizard(existingConfig);
      if (!config) return;
      await executeGenerateFlow(config);
      break;
    }

    case '--help':
    case 'help': {
      printHelp();
      break;
    }

    default: {
      console.log(c.red(`Unknown command: ${command}\n`));
      printHelp();
      process.exit(1);
    }
  }
}

async function executeGenerateFlow(config: ApiTestConfig): Promise<void> {
  const c = getColors();
  const outputDir = config.outputDir || './api-tests';

  // 1. Record
  const recordings = await recordAll(config);
  const successful = recordings.filter(r => r.status > 0);
  if (successful.length === 0) {
    console.log(c.red('No successful recordings. Check your host and endpoints.'));
    return;
  }

  // 2. Generate
  const suites = generateAll(config, recordings);

  // 3. Summary
  const total = suites.reduce((sum, s) => sum + s.testCases.length, 0);
  console.log(c.bold('Done!'));
  console.log(`  ${c.cyan('Recordings:')} ${join(outputDir, 'recordings/')}`);
  console.log(`  ${c.cyan('Test suites:')} ${join(outputDir, 'generated/')}`);
  console.log(`  ${c.cyan('Config:')} ${join(outputDir, 'config.json')}`);
  console.log(`\n  Run tests: ${c.bold('api-test run')}`);
  console.log(`  HTML report: ${c.bold('api-test run --report html')}\n`);
}

function printHelp(): void {
  console.log(`
  @nestjs-boot/api-test — Interactive API Test Generator

  Usage:
    api-test [command] [options]

  Commands:
    generate        Interactive wizard to configure and generate tests (default)
    run             Execute generated test suites
    update          Re-record happy cases and regenerate tests
    add             Add new endpoints to existing config
    help            Show this help

  Options:
    --config <path> Use specific config file (default: ./api-tests/config.json)
    --report html   Generate HTML report (with 'run')
    --filter <cat>  Filter by category: auth|body|params|headers|edge|method
    --bail          Stop on first test failure
`);
}
