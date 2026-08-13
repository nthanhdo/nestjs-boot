import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { MutationCategory, TestResult } from './types.js';
import { ensureDir, getColors, printTable } from './utils.js';

export function reportConsole(results: TestResult[]): void {
  const c = getColors();
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const rate = results.length > 0 ? ((passed / results.length) * 100).toFixed(1) : '0';

  console.log(c.bold('\n══════════════════════════════════════'));
  console.log(c.bold('  Test Results Summary'));
  console.log(c.bold('══════════════════════════════════════\n'));

  // Per-category breakdown
  const categories = [...new Set(results.map(r => r.testCase.category))];
  const rows = categories.map(cat => {
    const catResults = results.filter(r => r.testCase.category === cat);
    const catPassed = catResults.filter(r => r.passed).length;
    const catFailed = catResults.length - catPassed;
    return [cat, String(catResults.length), c.green(String(catPassed)), catFailed > 0 ? c.red(String(catFailed)) : '0'];
  });

  printTable(rows, ['Category', 'Total', 'Passed', 'Failed']);

  console.log(`\n  Total: ${results.length} | ${c.green(`Passed: ${passed}`)} | ${c.red(`Failed: ${failed}`)} | Rate: ${rate}%\n`);

  // Show failed tests
  const failedTests = results.filter(r => !r.passed);
  if (failedTests.length > 0) {
    console.log(c.red(c.bold('  Failed Tests:\n')));
    for (const r of failedTests) {
      console.log(`    ${c.red('✗')} ${r.testCase.name}`);
      console.log(`      ${c.dim(r.reason || `Got status ${r.actual.status}`)}`);
    }
    console.log('');
  }
}

export function reportJson(results: TestResult[], outputDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath = join(outputDir, 'reports', `${timestamp}.json`);
  ensureDir(filePath);

  const report = {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    rate: results.length > 0 ? ((results.filter(r => r.passed).length / results.length) * 100).toFixed(1) : '0',
    results: results.map(r => ({
      id: r.testCase.id,
      name: r.testCase.name,
      category: r.testCase.category,
      mutation: r.testCase.mutation,
      passed: r.passed,
      reason: r.reason,
      expectedStatus: r.testCase.expect.status,
      actualStatus: r.actual.status,
      duration: r.actual.duration,
    })),
  };

  writeFileSync(filePath, JSON.stringify(report, null, 2));
  return filePath;
}

export function reportHtml(results: TestResult[], outputDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath = join(outputDir, 'reports', `${timestamp}.html`);
  ensureDir(filePath);

  let templatePath: string;
  try {
    templatePath = resolve(__dirname, '../templates/report.html');
    readFileSync(templatePath, 'utf-8'); // test exists
  } catch {
    templatePath = join(outputDir, '..', 'templates', 'report.html');
  }

  let template: string;
  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch {
    template = DEFAULT_TEMPLATE;
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const rate = results.length > 0 ? ((passed / results.length) * 100).toFixed(1) : '0';

  const categories = [...new Set(results.map(r => r.testCase.category))] as MutationCategory[];
  const categoryRows = categories.map(cat => {
    const catR = results.filter(r => r.testCase.category === cat);
    const catP = catR.filter(r => r.passed).length;
    return `<tr><td>${cat}</td><td>${catR.length}</td><td class="pass">${catP}</td><td class="fail">${catR.length - catP}</td></tr>`;
  }).join('\n');

  const testRows = results.map(r => {
    const cls = r.passed ? 'pass' : 'fail';
    const status = Array.isArray(r.testCase.expect.status) ? r.testCase.expect.status.join('|') : r.testCase.expect.status;
    return `<tr class="${cls}"><td>${r.testCase.name}</td><td>${r.testCase.category}</td><td>${status}</td><td>${r.actual.status}</td><td>${r.passed ? 'PASS' : 'FAIL'}</td><td>${r.reason || ''}</td></tr>`;
  }).join('\n');

  const html = template
    .replace('{{TIMESTAMP}}', new Date().toISOString())
    .replace('{{TOTAL}}', String(results.length))
    .replace('{{PASSED}}', String(passed))
    .replace('{{FAILED}}', String(failed))
    .replace('{{RATE}}', rate)
    .replace('{{CATEGORY_ROWS}}', categoryRows)
    .replace('{{TEST_ROWS}}', testRows);

  writeFileSync(filePath, html);
  return filePath;
}

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>API Test Report</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;background:#0d1117;color:#c9d1d9}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{border:1px solid #30363d;padding:8px 12px;text-align:left}
th{background:#161b22}
.pass{color:#3fb950} .fail{color:#f85149}
tr.pass td:last-child{color:#3fb950} tr.fail td:last-child{color:#f85149}
h1{color:#58a6ff} .summary{display:flex;gap:2rem;margin:1rem 0}
.stat{background:#161b22;padding:1rem 2rem;border-radius:8px}
.stat .label{color:#8b949e;font-size:0.85rem} .stat .value{font-size:1.5rem;font-weight:bold}
</style></head><body>
<h1>API Test Report</h1>
<p>Generated: {{TIMESTAMP}}</p>
<div class="summary">
<div class="stat"><div class="label">Total</div><div class="value">{{TOTAL}}</div></div>
<div class="stat"><div class="label">Passed</div><div class="value pass">{{PASSED}}</div></div>
<div class="stat"><div class="label">Failed</div><div class="value fail">{{FAILED}}</div></div>
<div class="stat"><div class="label">Rate</div><div class="value">{{RATE}}%</div></div>
</div>
<h2>By Category</h2>
<table><tr><th>Category</th><th>Total</th><th>Passed</th><th>Failed</th></tr>
{{CATEGORY_ROWS}}
</table>
<h2>All Tests</h2>
<table><tr><th>Test</th><th>Category</th><th>Expected</th><th>Actual</th><th>Result</th><th>Reason</th></tr>
{{TEST_ROWS}}
</table>
</body></html>`;
