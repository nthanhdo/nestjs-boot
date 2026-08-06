#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

function usage() {
  console.log(`
Usage: nestjs-boot new <project-name> [options]

Options:
  --grpc       Include gRPC transport setup
  --no-cache   Exclude Redis cache configuration
  --no-auth    Exclude auth module configuration
  -h, --help   Show this help message

Example:
  npx nestjs-boot new my-service
  npx nestjs-boot new my-service --grpc --no-cache
`);
}

function parseArgs(args) {
  const flags = {
    grpc: false,
    cache: true,
    auth: true,
    name: null,
  };

  const positional = [];
  for (const arg of args) {
    if (arg === '--grpc') flags.grpc = true;
    else if (arg === '--no-cache') flags.cache = false;
    else if (arg === '--no-auth') flags.auth = false;
    else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  // Expect: "new <name>" or just "<name>"
  if (positional[0] === 'new') positional.shift();
  flags.name = positional[0] || null;

  return flags;
}

function renderTemplate(content, vars) {
  // Replace {{name}}
  let result = content.replace(/\{\{name\}\}/g, vars.name);

  // Process {{#if <flag>}}...{{/if}} blocks
  result = result.replace(
    /\{\{#if (\w+)\}\}\n?([\s\S]*?)\{\{\/if\}\}\n?/g,
    (_, flag, block) => {
      return vars[flag] ? block : '';
    },
  );

  return result;
}

function loadTemplate(name) {
  const path = join(TEMPLATES_DIR, name);
  return readFileSync(path, 'utf-8');
}

function writeFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

function createProject(flags) {
  const { name, grpc, cache, auth } = flags;
  const projectDir = join(process.cwd(), name);

  if (existsSync(projectDir)) {
    console.error(`Error: directory "${name}" already exists.`);
    process.exit(1);
  }

  const vars = { name, grpc, cache, auth };

  console.log(`\nCreating nestjs-boot project: ${name}\n`);

  // Core files
  const files = [
    { tpl: 'main.ts.tpl', out: 'src/main.ts' },
    { tpl: 'app.module.ts.tpl', out: 'src/app.module.ts' },
    { tpl: 'app.controller.ts.tpl', out: 'src/app.controller.ts' },
    { tpl: 'app.service.ts.tpl', out: 'src/app.service.ts' },
    { tpl: 'package.json.tpl', out: 'package.json' },
    { tpl: 'tsconfig.json.tpl', out: 'tsconfig.json' },
    { tpl: '.env.example.tpl', out: '.env.example' },
    { tpl: 'Dockerfile.tpl', out: 'Dockerfile' },
    { tpl: 'docker-compose.yml.tpl', out: 'docker-compose.yml' },
    { tpl: 'k8s/deployment.yaml', out: 'k8s/deployment.yaml' },
    { tpl: 'k8s/service.yaml', out: 'k8s/service.yaml' },
    { tpl: 'k8s/configmap.yaml', out: 'k8s/configmap.yaml' },
    { tpl: 'k8s/hpa.yaml', out: 'k8s/hpa.yaml' },
  ];

  // Add proto file if grpc
  if (grpc) {
    files.push({ tpl: 'proto.tpl', out: `proto/${name}.proto` });
  }

  for (const { tpl, out } of files) {
    const template = loadTemplate(tpl);
    const rendered = renderTemplate(template, vars);
    const outPath = join(projectDir, out);
    writeFile(outPath, rendered);
    console.log(`  created ${out}`);
  }

  // Copy .env.example to .env
  const envContent = loadTemplate('.env.example.tpl');
  writeFile(join(projectDir, '.env'), renderTemplate(envContent, vars));
  console.log(`  created .env`);

  console.log(`
Done! Next steps:

  cd ${name}
  npm install
  npm run build
  npm start
`);
}

// --- Main ---
const args = process.argv.slice(2);

if (args.length === 0) {
  usage();
  process.exit(1);
}

const flags = parseArgs(args);

if (!flags.name) {
  console.error('Error: project name is required.');
  usage();
  process.exit(1);
}

// Validate name (lowercase, hyphens, no spaces)
if (!/^[a-z][a-z0-9-]*$/.test(flags.name)) {
  console.error('Error: project name must be lowercase alphanumeric with hyphens (e.g. my-service).');
  process.exit(1);
}

createProject(flags);
