#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import * as p from '@clack/prompts';
import pc from 'picocolors';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');
const PKG = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

// ── Option definitions ──────────────────────────────────────────────

const DB_OPTIONS = [
  { value: 'mongodb',        label: 'MongoDB (Mongoose)',    hint: 'default' },
  { value: 'postgres',       label: 'PostgreSQL (TypeORM)' },
  { value: 'mysql',          label: 'MySQL (TypeORM)' },
  { value: 'dynamodb',       label: 'DynamoDB (dynamoose)' },
  { value: 'elasticsearch',  label: 'Elasticsearch' },
  { value: 'none',           label: 'None' },
];

const CACHE_OPTIONS = [
  { value: 'redis',     label: 'Redis',     hint: 'default' },
  { value: 'memcached', label: 'Memcached' },
  { value: 'none',      label: 'None' },
];

const AUTH_OPTIONS = [
  { value: 'jwt',  label: 'JWT',  hint: 'default' },
  { value: 'none', label: 'None' },
];

const TRANSPORT_OPTIONS = [
  { value: 'http',     label: 'HTTP only',       hint: 'default' },
  { value: 'grpc',     label: 'HTTP + gRPC' },
  { value: 'tcp',      label: 'HTTP + TCP' },
  { value: 'nats',     label: 'HTTP + NATS' },
  { value: 'rabbitmq', label: 'HTTP + RabbitMQ' },
];

const DEFAULTS = {
  db: 'mongodb',
  cache: 'redis',
  auth: 'jwt',
  transport: 'http',
};

// ── Arg parsing ─────────────────────────────────────────────────────

function parseArgs(args) {
  const result = { name: null, yes: false, help: false };
  const positional = [];

  for (const arg of args) {
    if (arg === '-y' || arg === '--yes') { result.yes = true; continue; }
    if (arg === '-h' || arg === '--help') { result.help = true; continue; }
    if (arg === '--grpc') { result.transport = 'grpc'; continue; }
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) { result[match[1]] = match[2]; continue; }
    if (arg.startsWith('--no-')) { result[arg.slice(5)] = 'none'; continue; }
    if (!arg.startsWith('-')) positional.push(arg);
  }

  if (positional[0] === 'new') positional.shift();
  result.name = positional[0] || null;
  return result;
}

function usage() {
  console.log(`
${pc.bold('nestjs-boot')} ${pc.dim(`v${PKG.version}`)}

${pc.bold('Usage:')} nestjs-boot new <project-name> [options]

${pc.bold('Options:')}
  --db=<type>         Database: mongodb, postgres, mysql, dynamodb, elasticsearch, none
  --cache=<type>      Cache: redis, memcached, none
  --auth=<type>       Auth: jwt, none
  --transport=<type>  Transport: http, grpc, tcp, nats, rabbitmq
  -y, --yes           Accept all defaults (no prompts)
  -h, --help          Show this help message

${pc.bold('Examples:')}
  npx nestjs-boot new my-service
  npx nestjs-boot new my-service --db=postgres --cache=redis --auth=jwt --transport=grpc
  npx nestjs-boot new my-service -y
`);
}

// ── Template engine ─────────────────────────────────────────────────

function renderTemplate(content, vars) {
  let result = content.replace(/\{\{name\}\}/g, vars.name);

  // {{#if flag}}...{{/if}}
  result = result.replace(
    /\{\{#if (\w+)\}\}\n?([\s\S]*?)\{\{\/if\}\}\n?/g,
    (_, flag, block) => vars[flag] ? block : '',
  );

  // {{#eq field "value"}}...{{/eq}}
  result = result.replace(
    /\{\{#eq (\w+) "([^"]+)"\}\}\n?([\s\S]*?)\{\{\/eq\}\}\n?/g,
    (_, field, value, block) => vars[field] === value ? block : '',
  );

  // {{#neq field "value"}}...{{/neq}}
  result = result.replace(
    /\{\{#neq (\w+) "([^"]+)"\}\}\n?([\s\S]*?)\{\{\/neq\}\}\n?/g,
    (_, field, value, block) => vars[field] !== value ? block : '',
  );

  // {{#in field "v1|v2|v3"}}...{{/in}}
  result = result.replace(
    /\{\{#in (\w+) "([^"]+)"\}\}\n?([\s\S]*?)\{\{\/in\}\}\n?/g,
    (_, field, values, block) => values.split('|').includes(vars[field]) ? block : '',
  );

  return result;
}

function loadTemplate(name) {
  return readFileSync(join(TEMPLATES_DIR, name), 'utf-8');
}

function writeFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

// ── Interactive prompts ─────────────────────────────────────────────

async function runInteractive(cliArgs) {
  p.intro(pc.bold(`nestjs-boot`) + pc.dim(` v${PKG.version}`));

  const name = cliArgs.name || await p.text({
    message: 'Project name:',
    placeholder: 'my-service',
    validate: (v) => {
      if (!v) return 'Required';
      if (!/^[a-z][a-z0-9-]*$/.test(v)) return 'Lowercase alphanumeric with hyphens';
    },
  });
  if (p.isCancel(name)) { p.cancel('Cancelled.'); process.exit(0); }

  const db = cliArgs.db || await p.select({ message: 'Database:', options: DB_OPTIONS, initialValue: 'mongodb' });
  if (p.isCancel(db)) { p.cancel('Cancelled.'); process.exit(0); }

  const cache = cliArgs.cache || await p.select({ message: 'Cache:', options: CACHE_OPTIONS, initialValue: 'redis' });
  if (p.isCancel(cache)) { p.cancel('Cancelled.'); process.exit(0); }

  const auth = cliArgs.auth || await p.select({ message: 'Auth:', options: AUTH_OPTIONS, initialValue: 'jwt' });
  if (p.isCancel(auth)) { p.cancel('Cancelled.'); process.exit(0); }

  const transport = cliArgs.transport || await p.select({ message: 'Transport:', options: TRANSPORT_OPTIONS, initialValue: 'http' });
  if (p.isCancel(transport)) { p.cancel('Cancelled.'); process.exit(0); }

  return { name, db, cache, auth, transport };
}

// ── Project creation ────────────────────────────────────────────────

function createProject(config) {
  const { name, db, cache, auth, transport } = config;
  const projectDir = join(process.cwd(), name);

  if (existsSync(projectDir)) {
    p.log.error(`Directory "${name}" already exists.`);
    process.exit(1);
  }

  // Build template vars — boolean flags for backward compat + string values for new #eq
  const vars = {
    name,
    db,
    cache: cache !== 'none',
    auth: auth !== 'none',
    grpc: transport === 'grpc',
    // String values for #eq / #in
    dbType: db,
    cacheType: cache,
    authType: auth,
    transportType: transport,
  };

  const s = p.spinner();
  s.start('Creating project...');

  const files = [
    { tpl: 'main.ts.tpl',            out: 'src/main.ts' },
    { tpl: 'app.module.ts.tpl',      out: 'src/app.module.ts' },
    { tpl: 'app.controller.ts.tpl',  out: 'src/app.controller.ts' },
    { tpl: 'app.service.ts.tpl',     out: 'src/app.service.ts' },
    { tpl: 'package.json.tpl',       out: 'package.json' },
    { tpl: 'tsconfig.json.tpl',      out: 'tsconfig.json' },
    { tpl: '.env.example.tpl',       out: '.env.example' },
    { tpl: '.gitignore.tpl',         out: '.gitignore' },
    { tpl: '.eslintrc.cjs.tpl',      out: '.eslintrc.cjs' },
    { tpl: '.prettierrc.tpl',        out: '.prettierrc' },
    { tpl: 'Dockerfile.tpl',         out: 'Dockerfile' },
    { tpl: '.dockerignore.tpl',      out: '.dockerignore' },
    { tpl: 'docker-compose.yml.tpl', out: 'docker-compose.yml' },
    { tpl: 'vitest.config.ts.tpl',   out: 'vitest.config.ts' },
    { tpl: 'app.e2e-spec.ts.tpl',    out: 'test/app.e2e-spec.ts' },
    { tpl: 'README.md.tpl',          out: 'README.md' },
    { tpl: 'k8s/deployment.yaml',    out: 'k8s/deployment.yaml' },
    { tpl: 'k8s/service.yaml',       out: 'k8s/service.yaml' },
    { tpl: 'k8s/configmap.yaml',     out: 'k8s/configmap.yaml' },
    { tpl: 'k8s/hpa.yaml',           out: 'k8s/hpa.yaml' },
  ];

  // Add proto file if gRPC
  if (transport === 'grpc') {
    files.push({ tpl: 'proto.tpl', out: `proto/${name}.proto` });
  }

  const createdFiles = [];
  for (const { tpl, out } of files) {
    const template = loadTemplate(tpl);
    const rendered = renderTemplate(template, vars);
    writeFile(join(projectDir, out), rendered);
    createdFiles.push(out);
  }

  // Copy .env.example → .env
  const envContent = loadTemplate('.env.example.tpl');
  writeFile(join(projectDir, '.env'), renderTemplate(envContent, vars));
  createdFiles.push('.env');

  s.stop('Project created!');

  // Print file list
  for (const f of createdFiles) {
    p.log.step(pc.dim(`  created ${f}`));
  }

  return { projectDir, createdFiles };
}

function installDeps(projectDir, name) {
  const s = p.spinner();
  s.start('Installing dependencies...');
  try {
    execSync('npm install --loglevel=error', { cwd: projectDir, stdio: 'pipe', timeout: 120_000 });
    s.stop('Dependencies installed!');
  } catch (e) {
    s.stop(pc.yellow('npm install failed — run it manually.'));
  }
}

function printNextSteps(config) {
  const { name, db, cache } = config;

  const dockerServices = [];
  if (db !== 'none') dockerServices.push(db === 'mongodb' ? 'MongoDB' : db === 'postgres' ? 'PostgreSQL' : db === 'mysql' ? 'MySQL' : db === 'dynamodb' ? 'DynamoDB Local' : 'Elasticsearch');
  if (cache !== 'none') dockerServices.push(cache === 'redis' ? 'Redis' : 'Memcached');

  console.log('');
  p.log.success(pc.green(pc.bold('Project created successfully!')));
  console.log('');
  console.log(pc.bold('  Next steps:'));
  console.log('');
  console.log(`    ${pc.cyan('cd')} ${name}`);
  if (dockerServices.length) {
    console.log(`    ${pc.cyan('docker-compose up -d')}          ${pc.dim(`# Start ${dockerServices.join(' + ')}`)}`);
  }
  console.log(`    ${pc.cyan('npm run start:dev')}             ${pc.dim('# Start dev server with hot reload')}`);
  console.log('');
  console.log(`  Your service: ${pc.cyan('http://localhost:3000')}`);
  console.log(`  Health check: ${pc.cyan('http://localhost:3000/health')}`);
  console.log('');
}

// ── Main ────────────────────────────────────────────────────────────

// ── Resource generator ─────────────────────────────────────────────

function generateResource(name) {
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  const lower = name.toLowerCase();
  const dir = join(process.cwd(), 'src', lower);

  if (existsSync(dir)) {
    console.error(pc.red(`Error: directory "src/${lower}" already exists.`));
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });

  // Schema
  writeFile(join(dir, `${lower}.schema.ts`), `import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class ${pascal} extends Document {
  @Prop({ required: true })
  name: string;
}

export const ${pascal}Schema = SchemaFactory.createForClass(${pascal});
`);

  // DTO
  writeFile(join(dir, `${lower}.dto.ts`), `export class Create${pascal}Dto {
  name: string;
}

export class Update${pascal}Dto {
  name?: string;
}
`);

  // Service
  writeFile(join(dir, `${lower}.service.ts`), `import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ${pascal} } from './${lower}.schema';
import { Create${pascal}Dto, Update${pascal}Dto } from './${lower}.dto';

@Injectable()
export class ${pascal}Service {
  constructor(
    @InjectModel(${pascal}.name) private readonly model: Model<${pascal}>,
  ) {}

  async create(dto: Create${pascal}Dto): Promise<${pascal}> {
    return this.model.create(dto);
  }

  async findAll(): Promise<${pascal}[]> {
    return this.model.find().exec();
  }

  async findById(id: string): Promise<${pascal} | null> {
    return this.model.findById(id).exec();
  }

  async update(id: string, dto: Update${pascal}Dto): Promise<${pascal} | null> {
    return this.model.findByIdAndUpdate(id, dto, { new: true }).exec();
  }

  async remove(id: string): Promise<${pascal} | null> {
    return this.model.findByIdAndDelete(id).exec();
  }
}
`);

  // Controller
  writeFile(join(dir, `${lower}.controller.ts`), `import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ${pascal}Service } from './${lower}.service';
import { Create${pascal}Dto, Update${pascal}Dto } from './${lower}.dto';

@Controller('${lower}s')
export class ${pascal}Controller {
  constructor(private readonly service: ${pascal}Service) {}

  @Post()
  create(@Body() dto: Create${pascal}Dto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Update${pascal}Dto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
`);

  // Module
  writeFile(join(dir, `${lower}.module.ts`), `import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ${pascal}, ${pascal}Schema } from './${lower}.schema';
import { ${pascal}Service } from './${lower}.service';
import { ${pascal}Controller } from './${lower}.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ${pascal}.name, schema: ${pascal}Schema }]),
  ],
  controllers: [${pascal}Controller],
  providers: [${pascal}Service],
  exports: [${pascal}Service],
})
export class ${pascal}Module {}
`);

  // Spec
  writeFile(join(dir, `${lower}.spec.ts`), `import { describe, it, expect } from 'vitest';
import { ${pascal}Service } from './${lower}.service';

describe('${pascal}Service', () => {
  it('should be defined', () => {
    expect(${pascal}Service).toBeDefined();
  });
});
`);

  console.log('');
  console.log(pc.green(pc.bold(`Resource "${lower}" generated!`)));
  console.log('');
  const files = [
    `src/${lower}/${lower}.schema.ts`,
    `src/${lower}/${lower}.dto.ts`,
    `src/${lower}/${lower}.service.ts`,
    `src/${lower}/${lower}.controller.ts`,
    `src/${lower}/${lower}.module.ts`,
    `src/${lower}/${lower}.spec.ts`,
  ];
  for (const f of files) {
    console.log(`  ${pc.dim('created')} ${f}`);
  }
  console.log('');
  console.log(`  ${pc.cyan('Next:')} import ${pascal}Module in your AppModule.`);
  console.log('');
}

// ── Main ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

// Handle `g resource <name>` subcommand
if (args[0] === 'g' || args[0] === 'generate') {
  if (args[1] === 'resource' && args[2]) {
    const resourceName = args[2];
    if (!/^[a-z][a-z0-9-]*$/.test(resourceName)) {
      console.error(pc.red('Error: resource name must be lowercase alphanumeric with hyphens.'));
      process.exit(1);
    }
    generateResource(resourceName);
    process.exit(0);
  } else {
    console.error(pc.red('Usage: nestjs-boot g resource <name>'));
    process.exit(1);
  }
}

if (args.length === 0) {
  usage();
  process.exit(1);
}

const cliArgs = parseArgs(args);

if (cliArgs.help) {
  usage();
  process.exit(0);
}

// Validate name early if provided
if (cliArgs.name && !/^[a-z][a-z0-9-]*$/.test(cliArgs.name)) {
  console.error(pc.red('Error: project name must be lowercase alphanumeric with hyphens (e.g. my-service).'));
  process.exit(1);
}

let config;

// Non-TTY (piped/CI) → treat as --yes
const isNonInteractive = cliArgs.yes || !process.stdin.isTTY;

if (isNonInteractive) {
  // --yes: use all defaults
  if (!cliArgs.name) {
    console.error(pc.red('Error: project name is required (use --yes or provide via args).'));
    process.exit(1);
  }
  config = {
    name: cliArgs.name,
    db: cliArgs.db || DEFAULTS.db,
    cache: cliArgs.cache || DEFAULTS.cache,
    auth: cliArgs.auth || DEFAULTS.auth,
    transport: cliArgs.transport || DEFAULTS.transport,
  };
  console.log('');
  console.log(pc.bold(`nestjs-boot`) + pc.dim(` v${PKG.version}`));
  console.log('');
} else {
  // Check if all options were provided via flags (skip interactive)
  const allFlagsProvided = cliArgs.name && cliArgs.db && cliArgs.cache && cliArgs.auth && cliArgs.transport;
  if (allFlagsProvided) {
    config = {
      name: cliArgs.name,
      db: cliArgs.db,
      cache: cliArgs.cache,
      auth: cliArgs.auth,
      transport: cliArgs.transport,
    };
    console.log('');
    console.log(pc.bold(`nestjs-boot`) + pc.dim(` v${PKG.version}`));
    console.log('');
  } else {
    config = await runInteractive(cliArgs);
  }
}

const { projectDir } = createProject(config);
installDeps(projectDir, config.name);
printNextSteps(config);
