import * as readline from 'node:readline';
import type { ApiTestConfig, AuthConfig, EndpointConfig, HttpMethod, MutationCategory } from './types.js';
import { getColors, safeJsonParse } from './utils.js';

// ── Clack-compatible fallback using readline ──

interface Prompter {
  intro(msg: string): void;
  outro(msg: string): void;
  text(opts: { message: string; placeholder?: string; defaultValue?: string; validate?: (v: string) => string | void }): Promise<string | symbol>;
  password(opts: { message: string }): Promise<string | symbol>;
  select<T>(opts: { message: string; options: { value: T; label: string }[] }): Promise<T | symbol>;
  multiselect<T>(opts: { message: string; options: { value: T; label: string; selected?: boolean }[] }): Promise<T[] | symbol>;
  confirm(opts: { message: string; active?: string; inactive?: string }): Promise<boolean | symbol>;
  isCancel(v: unknown): boolean;
}

async function loadPrompter(): Promise<Prompter> {
  try {
    const clack = await import('@clack/prompts');
    return clack as unknown as Prompter;
  } catch {
    return createReadlinePrompter();
  }
}

function createReadlinePrompter(): Prompter {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise(res => rl.question(q, res));
  const c = getColors();

  const CANCEL = Symbol('cancel');

  return {
    intro(msg: string) { console.log(`\n${c.cyan('◆')} ${c.bold(msg)}\n`); },
    outro(msg: string) { console.log(`\n${c.green('◆')} ${msg}\n`); rl.close(); },
    isCancel(v: unknown) { return v === CANCEL; },

    async text(opts) {
      const hint = opts.placeholder ? c.dim(` (${opts.placeholder})`) : '';
      const answer = await ask(`${c.cyan('◇')} ${opts.message}${hint}: `);
      if (answer === '') return opts.defaultValue ?? '';
      return answer;
    },
    async password(opts) {
      const answer = await ask(`${c.cyan('◇')} ${opts.message}: `);
      return answer;
    },
    async select(opts) {
      console.log(`${c.cyan('◇')} ${opts.message}`);
      opts.options.forEach((o, i) => console.log(`  ${c.cyan(`${i + 1})`)} ${o.label}`));
      const answer = await ask(`  ${c.dim('Enter number')}: `);
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < opts.options.length) return opts.options[idx].value;
      return opts.options[0].value;
    },
    async multiselect(opts) {
      console.log(`${c.cyan('◇')} ${opts.message} ${c.dim('(comma-separated numbers, enter=all)')}`);
      opts.options.forEach((o, i) => console.log(`  ${c.cyan(`${i + 1})`)} ${o.label}`));
      const answer = await ask(`  ${c.dim('Selection')}: `);
      if (!answer.trim()) return opts.options.map(o => o.value);
      const indices = answer.split(',').map(s => parseInt(s.trim(), 10) - 1);
      return indices.filter(i => i >= 0 && i < opts.options.length).map(i => opts.options[i].value);
    },
    async confirm(opts) {
      const answer = await ask(`${c.cyan('◇')} ${opts.message} ${c.dim('(y/n)')}: `);
      return answer.toLowerCase().startsWith('y');
    },
  };
}

// ── Wizard ──

export async function runWizard(existingConfig?: ApiTestConfig): Promise<ApiTestConfig | null> {
  const p = await loadPrompter();

  p.intro('API Test Generator — Let\'s set up your test suite');

  // 1. Host
  const host = await p.text({
    message: 'Base URL?',
    placeholder: 'http://localhost:3000',
    defaultValue: existingConfig?.host ?? 'http://localhost:3000',
  });
  if (p.isCancel(host)) return null;

  // 2. Base path
  const basePath = await p.text({
    message: 'Base path? (optional, e.g. /api/v1)',
    placeholder: '/api',
    defaultValue: existingConfig?.basePath ?? '',
  });
  if (p.isCancel(basePath)) return null;

  // 3. Auth
  const authType = await p.select<AuthConfig['type']>({
    message: 'Authentication method?',
    options: [
      { value: 'bearer', label: 'Bearer Token' },
      { value: 'api-key', label: 'API Key' },
      { value: 'cookie', label: 'Cookie' },
      { value: 'basic', label: 'Basic Auth' },
      { value: 'none', label: 'None' },
    ],
  });
  if (p.isCancel(authType)) return null;

  let auth: AuthConfig | undefined;
  if (authType !== 'none') {
    auth = { type: authType };
    switch (authType) {
      case 'bearer': {
        const token = await p.text({ message: 'Bearer token?' });
        if (p.isCancel(token)) return null;
        auth.token = token as string;
        break;
      }
      case 'api-key': {
        const headerName = await p.text({ message: 'Header name?', placeholder: 'X-API-Key', defaultValue: 'X-API-Key' });
        if (p.isCancel(headerName)) return null;
        const key = await p.text({ message: 'API key value?' });
        if (p.isCancel(key)) return null;
        auth.headerName = headerName as string;
        auth.token = key as string;
        break;
      }
      case 'cookie': {
        const cookieName = await p.text({ message: 'Cookie name?' });
        if (p.isCancel(cookieName)) return null;
        const cookieValue = await p.text({ message: 'Cookie value?' });
        if (p.isCancel(cookieValue)) return null;
        auth.cookieName = cookieName as string;
        auth.cookieValue = cookieValue as string;
        break;
      }
      case 'basic': {
        const username = await p.text({ message: 'Username?' });
        if (p.isCancel(username)) return null;
        const password = await p.password({ message: 'Password?' });
        if (p.isCancel(password)) return null;
        auth.username = username as string;
        auth.password = password as string;
        break;
      }
    }
  }

  // 4. Global headers
  const globalHeaders: Record<string, string> = {};
  const addGlobalHeaders = await p.confirm({ message: 'Add global headers?' });
  if (p.isCancel(addGlobalHeaders)) return null;
  if (addGlobalHeaders) {
    let more = true;
    while (more) {
      const name = await p.text({ message: 'Header name' });
      if (p.isCancel(name)) return null;
      const value = await p.text({ message: `Value for ${name as string}` });
      if (p.isCancel(value)) return null;
      globalHeaders[name as string] = value as string;
      more = await p.confirm({ message: 'Add another header?' }) as boolean;
    }
  }

  // 5. Endpoints
  const endpoints: EndpointConfig[] = existingConfig?.endpoints ? [...existingConfig.endpoints] : [];

  let addMore = true;
  while (addMore) {
    const method = await p.select<HttpMethod>({
      message: 'HTTP Method?',
      options: [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' },
        { value: 'PATCH', label: 'PATCH' },
        { value: 'DELETE', label: 'DELETE' },
      ],
    });
    if (p.isCancel(method)) return null;

    const path = await p.text({ message: 'Path?', placeholder: '/users/:id' });
    if (p.isCancel(path)) return null;

    const description = await p.text({ message: 'Description? (optional)', defaultValue: '' });
    if (p.isCancel(description)) return null;

    const endpoint: EndpointConfig = { method: method as HttpMethod, path: path as string };
    if (description) endpoint.description = description as string;

    // Path params
    const paramMatches = (path as string).match(/:(\w+)/g);
    if (paramMatches) {
      endpoint.params = {};
      for (const match of paramMatches) {
        const paramName = match.slice(1);
        const value = await p.text({ message: `Value for :${paramName}?` });
        if (p.isCancel(value)) return null;
        endpoint.params[paramName] = value as string;
      }
    }

    // Body
    if (['POST', 'PUT', 'PATCH'].includes(method as string)) {
      const bodyStr = await p.text({ message: 'Request body (JSON)?', placeholder: '{"key": "value"}' });
      if (p.isCancel(bodyStr)) return null;
      if (bodyStr && (bodyStr as string).trim()) {
        const parsed = safeJsonParse(bodyStr as string);
        if (parsed === null) {
          console.log(getColors().yellow('  Warning: Invalid JSON, storing as string'));
          endpoint.body = bodyStr as string;
        } else {
          endpoint.body = parsed;
        }
      }
    }

    // Query
    const queryStr = await p.text({ message: 'Query params? (key=value&...)', defaultValue: '' });
    if (p.isCancel(queryStr)) return null;
    if (queryStr && (queryStr as string).trim()) {
      endpoint.query = {};
      const pairs = (queryStr as string).split('&');
      for (const pair of pairs) {
        const [k, v] = pair.split('=');
        if (k) endpoint.query[k.trim()] = (v || '').trim();
      }
    }

    // Extra headers
    const extraHeaders = await p.text({ message: 'Extra headers? (key:value, ...)', defaultValue: '' });
    if (p.isCancel(extraHeaders)) return null;
    if (extraHeaders && (extraHeaders as string).trim()) {
      endpoint.headers = {};
      const parts = (extraHeaders as string).split(',');
      for (const part of parts) {
        const [k, ...rest] = part.split(':');
        if (k) endpoint.headers[k.trim()] = rest.join(':').trim();
      }
    }

    endpoints.push(endpoint);
    addMore = await p.confirm({ message: 'Add another endpoint?' }) as boolean;
    if (p.isCancel(addMore)) break;
  }

  if (endpoints.length === 0) {
    p.outro('No endpoints configured. Exiting.');
    return null;
  }

  // 6. Generation options
  const categories = await p.multiselect<MutationCategory>({
    message: 'Which mutation categories?',
    options: [
      { value: 'auth', label: 'Auth (token/key removal, invalid)', selected: true },
      { value: 'body', label: 'Body (missing fields, wrong types)', selected: true },
      { value: 'params', label: 'Params (invalid, missing, special chars)', selected: true },
      { value: 'headers', label: 'Headers (content-type, accept)', selected: true },
      { value: 'edge', label: 'Edge (XSS, SQL injection, long strings)', selected: true },
      { value: 'method', label: 'Method (wrong HTTP method)', selected: true },
    ],
  });
  if (p.isCancel(categories)) return null;

  const outputDir = await p.text({
    message: 'Output directory?',
    defaultValue: './api-tests',
    placeholder: './api-tests',
  });
  if (p.isCancel(outputDir)) return null;

  // Summary
  const c = getColors();
  console.log(`\n${c.bold('Summary:')}`);
  console.log(`  Host: ${c.cyan(host as string)}`);
  console.log(`  Auth: ${c.cyan(authType as string)}`);
  console.log(`  Endpoints: ${c.cyan(String(endpoints.length))}`);
  for (const ep of endpoints) {
    console.log(`    ${c.bold(ep.method)} ${ep.path}${ep.description ? ` — ${ep.description}` : ''}`);
  }
  console.log(`  Categories: ${c.cyan((categories as MutationCategory[]).join(', '))}`);
  console.log(`  Output: ${c.cyan(outputDir as string)}\n`);

  const proceed = await p.confirm({ message: 'Record happy cases and generate tests?' });
  if (p.isCancel(proceed) || !proceed) {
    p.outro('Cancelled.');
    return null;
  }

  p.outro('Starting...');

  return {
    host: host as string,
    basePath: (basePath as string) || undefined,
    auth,
    headers: Object.keys(globalHeaders).length > 0 ? globalHeaders : undefined,
    endpoints,
    outputDir: outputDir as string,
    categories: categories as MutationCategory[],
  };
}

