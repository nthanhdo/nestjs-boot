#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, statSync } from 'fs';
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

function generateResource(name, flags = {}) {
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  const lower = name.toLowerCase();
  const dir = join(process.cwd(), 'src', lower);
  const isCrud = flags.crud !== false; // default: full CRUD
  const isMinimal = flags.minimal === true;

  if (existsSync(dir)) {
    console.error(pc.red(`Error: directory "src/${lower}" already exists.`));
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });

  // Schema — Mongoose with timestamps + indexes
  writeFile(join(dir, `${lower}.schema.ts`), `import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ${pascal}Document = ${pascal} & Document;

@Schema({ timestamps: true, collection: '${lower}s' })
export class ${pascal} {
  @Prop({ required: true, index: true })
  name: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const ${pascal}Schema = SchemaFactory.createForClass(${pascal});

// Compound indexes
${pascal}Schema.index({ name: 1, isActive: 1 });
`);

  // DTO — with class-validator decorators
  writeFile(join(dir, `${lower}.dto.ts`), `import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class Create${pascal}Dto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class Update${pascal}Dto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
`);

  if (isMinimal) {
    // Minimal: just module + service (no controller, no CRUD, no test)
    writeFile(join(dir, `${lower}.service.ts`), `import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ${pascal}, ${pascal}Document } from './${lower}.schema';

@Injectable()
export class ${pascal}Service {
  constructor(
    @InjectModel(${pascal}.name) private readonly model: Model<${pascal}Document>,
  ) {}
}
`);

    writeFile(join(dir, `${lower}.module.ts`), `import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ${pascal}, ${pascal}Schema } from './${lower}.schema';
import { ${pascal}Service } from './${lower}.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ${pascal}.name, schema: ${pascal}Schema }]),
  ],
  providers: [${pascal}Service],
  exports: [${pascal}Service],
})
export class ${pascal}Module {}
`);

    const files = [
      `src/${lower}/${lower}.schema.ts`,
      `src/${lower}/${lower}.dto.ts`,
      `src/${lower}/${lower}.service.ts`,
      `src/${lower}/${lower}.module.ts`,
    ];

    console.log('');
    console.log(pc.green(pc.bold(`Resource "${lower}" generated! (minimal)`)));
    console.log('');
    for (const f of files) {
      console.log(`  ${pc.dim('created')} ${f}`);
    }
    console.log('');
    console.log(`  ${pc.cyan('Next:')} import ${pascal}Module in your AppModule.`);
    console.log('');
    return;
  }

  // Service — uses CrudService with lifecycle hooks
  if (isCrud) {
    writeFile(join(dir, `${lower}.service.ts`), `import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CrudService } from 'nestjs-boot';
import { ${pascal}, ${pascal}Document } from './${lower}.schema';

@Injectable()
export class ${pascal}Service extends CrudService<${pascal}Document> {
  constructor(
    @InjectModel(${pascal}.name) model: Model<${pascal}Document>,
  ) {
    super(model);
  }

  /**
   * Hook: called before creating a document.
   * Add custom validation, slug generation, etc.
   */
  protected async beforeCreate(data: Partial<${pascal}Document>): Promise<Partial<${pascal}Document>> {
    // Example: data.slug = slugify(data.name);
    return data;
  }

  /**
   * Hook: called after creating a document.
   * Emit events, update caches, etc.
   */
  protected async afterCreate(doc: ${pascal}Document): Promise<void> {
    // Example: await this.eventBus.emit('${lower}.created', { id: doc._id });
  }
}
`);
  } else {
    writeFile(join(dir, `${lower}.service.ts`), `import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ${pascal}, ${pascal}Document } from './${lower}.schema';
import { Create${pascal}Dto, Update${pascal}Dto } from './${lower}.dto';

@Injectable()
export class ${pascal}Service {
  constructor(
    @InjectModel(${pascal}.name) private readonly model: Model<${pascal}Document>,
  ) {}

  async create(dto: Create${pascal}Dto): Promise<${pascal}Document> {
    return this.model.create(dto);
  }

  async findAll(): Promise<${pascal}Document[]> {
    return this.model.find().exec();
  }

  async findById(id: string): Promise<${pascal}Document | null> {
    return this.model.findById(id).exec();
  }

  async update(id: string, dto: Update${pascal}Dto): Promise<${pascal}Document | null> {
    return this.model.findByIdAndUpdate(id, dto, { new: true }).exec();
  }

  async remove(id: string): Promise<${pascal}Document | null> {
    return this.model.findByIdAndDelete(id).exec();
  }
}
`);
  }

  // Controller — @Public on GETs, @Roles('admin') on DELETE
  writeFile(join(dir, `${lower}.controller.ts`), `import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { Public, Roles } from 'nestjs-boot';
import { ${pascal}Service } from './${lower}.service';
import { Create${pascal}Dto, Update${pascal}Dto } from './${lower}.dto';

@Controller('${lower}s')
export class ${pascal}Controller {
  constructor(private readonly service: ${pascal}Service) {}

  @Post()
  create(@Body() dto: Create${pascal}Dto) {
    return this.service.create(dto);
  }

  @Public()
  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.findAll({}, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Public()
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Update${pascal}Dto) {
    return this.service.update(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
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

  // Test — uses createTestApp + createFactory
  writeFile(join(dir, `${lower}.spec.ts`), `import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createFactory } from 'nestjs-boot/testing';
import type { TestAppContext, TestFactory } from 'nestjs-boot/testing';
import { ${pascal}Module } from './${lower}.module';
import { ${pascal}Service } from './${lower}.service';
import { ${pascal}Schema, ${pascal}Document } from './${lower}.schema';

describe('${pascal}Service', () => {
  let ctx: TestAppContext;
  let service: ${pascal}Service;
  let factory: TestFactory<{ name: string; isActive: boolean }>;

  beforeAll(async () => {
    ctx = await createTestApp(${pascal}Module);
    service = ctx.app.get(${pascal}Service);
    factory = createFactory('${pascal}', ${pascal}Schema, {
      name: () => \`Test ${pascal} \${Math.random().toString(36).slice(2, 8)}\`,
      isActive: true,
    });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a ${lower}', async () => {
    const data = factory.build();
    const result = await service.create(data);
    expect(result).toBeDefined();
    expect(result.name).toBe(data.name);
  });

  it('should find by id', async () => {
    const created = await factory.create(ctx.mongoConnection!, {});
    const found = await service.findById(created._id.toString());
    expect(found).toBeDefined();
    expect(found!.name).toBe(created.name);
  });
});
`);

  console.log('');
  console.log(pc.green(pc.bold(`Resource "${lower}" generated!${isCrud ? ' (with CrudService)' : ''}`)));
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

// ── Module dependency graph (Proposal 3: full analyzer) ───────────

function generateGraph(cliArgs) {
  // Parse graph-specific flags
  const flags = { strict: false, output: null, format: 'mermaid', project: process.cwd() };
  for (const arg of cliArgs) {
    if (arg === '--strict') flags.strict = true;
    else if (arg === '--format=json' || arg === '--json') flags.format = 'json';
    else if (arg.startsWith('--output=')) flags.output = arg.slice('--output='.length);
    else if (arg.startsWith('--project=')) flags.project = arg.slice('--project='.length);
  }

  // --- Inline implementations (no compiled TS dependency) ---

  // Tarjan's SCC cycle detection
  function detectCycles(nodes, edges) {
    const adj = new Map();
    for (const node of nodes) adj.set(node, []);
    for (const { from, to } of edges) {
      if (adj.has(from) && adj.has(to)) adj.get(from).push(to);
    }

    let idx = 0;
    const stack = [];
    const onStack = new Set();
    const indices = new Map();
    const lowlinks = new Map();
    const sccs = [];

    function strongconnect(v) {
      indices.set(v, idx);
      lowlinks.set(v, idx);
      idx++;
      stack.push(v);
      onStack.add(v);

      for (const w of (adj.get(v) || [])) {
        if (!indices.has(w)) {
          strongconnect(w);
          lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(w)));
        } else if (onStack.has(w)) {
          lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(w)));
        }
      }

      if (lowlinks.get(v) === indices.get(v)) {
        const scc = [];
        let w;
        do {
          w = stack.pop();
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);
        if (scc.length > 1) {
          scc.reverse();
          sccs.push(scc);
        }
      }
    }

    for (const node of nodes) {
      if (!indices.has(node)) strongconnect(node);
    }
    return sccs;
  }

  // Walk directory for module files
  function walkDir(dir, ext) {
    const results = [];
    if (!existsSync(dir)) return results;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (entry === 'node_modules' || entry === '.git') continue;
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) results.push(...walkDir(full, ext));
        else if (entry.endsWith(`.module${ext}`)) results.push(full);
      } catch { /* skip */ }
    }
    return results;
  }

  // Parse @Module metadata from a file
  function parseModuleFile(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const classMatch = content.match(/(?:export\s+)?class\s+(\w+Module)\b/);
    if (!classMatch) return null;
    const name = classMatch[1];
    const decoratorMatch = content.match(/@Module\s*\(\s*\{([\s\S]*?)\}\s*\)/);
    if (!decoratorMatch) return { name, filePath, imports: [], exports: [], providers: [] };

    const block = decoratorMatch[1];
    function extractArray(key) {
      const regex = new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`);
      const match = block.match(regex);
      if (!match) return [];
      const refs = match[1].match(/\b(\w+(?:Module|Service|Guard|Interceptor|Pipe|Filter))\b/g) || [];
      return [...new Set(refs.filter(r => r !== name))];
    }

    return {
      name, filePath,
      imports: extractArray('imports').filter(i => i.endsWith('Module')),
      exports: extractArray('exports'),
      providers: extractArray('providers'),
    };
  }

  // Analyze
  let searchDir = join(flags.project, 'src');
  let ext = '.ts';
  if (!existsSync(searchDir)) {
    searchDir = join(flags.project, 'dist');
    ext = '.js';
  }
  if (!existsSync(searchDir)) {
    console.error(pc.red('Error: no src/ or dist/ directory found. Run from your NestJS project root, or use --project=<path>.'));
    process.exit(1);
  }

  const moduleFiles = walkDir(searchDir, ext);
  if (moduleFiles.length === 0) {
    console.log(pc.yellow('No module files found.'));
    process.exit(0);
  }

  const modules = [];
  for (const file of moduleFiles) {
    const mod = parseModuleFile(file);
    if (mod) modules.push(mod);
  }

  const knownModules = new Set(modules.map(m => m.name));
  const edges = [];
  for (const mod of modules) {
    for (const imp of mod.imports) {
      if (knownModules.has(imp)) edges.push({ from: mod.name, to: imp });
    }
  }

  const cycles = detectCycles(modules.map(m => m.name), edges);

  // Stats
  const fanOut = new Map();
  const fanIn = new Map();
  for (const mod of modules) { fanOut.set(mod.name, 0); fanIn.set(mod.name, 0); }
  for (const e of edges) {
    fanOut.set(e.from, (fanOut.get(e.from) || 0) + 1);
    fanIn.set(e.to, (fanIn.get(e.to) || 0) + 1);
  }
  let maxFanOut = { module: '', count: 0 };
  let maxFanIn = { module: '', count: 0 };
  for (const [m, c] of fanOut) { if (c > maxFanOut.count) maxFanOut = { module: m, count: c }; }
  for (const [m, c] of fanIn) { if (c > maxFanIn.count) maxFanIn = { module: m, count: c }; }

  const stats = {
    totalModules: modules.length,
    totalEdges: edges.length,
    maxFanOut, maxFanIn,
    cycleCount: cycles.length,
  };

  const result = { modules, edges, cycles, stats };

  // --- Output ---

  if (flags.format === 'json') {
    const jsonOutput = JSON.stringify({
      modules: modules.map(m => ({ name: m.name, filePath: m.filePath, imports: m.imports, exports: m.exports, providers: m.providers })),
      edges, cycles, stats,
    }, null, 2);
    if (flags.output) {
      writeFileSync(flags.output, jsonOutput, 'utf-8');
      console.log(pc.green(`JSON written to ${flags.output}`));
    } else {
      console.log(jsonOutput);
    }
    if (flags.strict && cycles.length > 0) process.exit(1);
    return;
  }

  // Mermaid output
  const mermaidLines = ['graph TD'];
  const nodesWithEdges = new Set();
  for (const e of edges) { nodesWithEdges.add(e.from); nodesWithEdges.add(e.to); }
  for (const mod of modules) {
    if (!nodesWithEdges.has(mod.name)) mermaidLines.push(`    ${mod.name}[${mod.name}]`);
  }
  for (const e of edges) mermaidLines.push(`    ${e.from} --> ${e.to}`);
  const cycleNodes = new Set(cycles.flat());
  for (const node of cycleNodes) {
    mermaidLines.push(`    style ${node} fill:#ef4444,stroke:#dc2626,color:#fff`);
  }
  const mermaidStr = mermaidLines.join('\n');

  // Build full output
  let output = '';
  output += `\n  ${pc.bold('nestjs-boot')} — Module Dependency Graph\n\n`;
  output += `  Modules: ${stats.totalModules} | Edges: ${stats.totalEdges} | Cycles: ${stats.cycleCount}\n`;

  if (cycles.length > 0) {
    output += '\n';
    for (const cycle of cycles) {
      output += pc.red(`  ⚠ Cycle detected:\n`);
      output += pc.red(`    ${cycle.join(' → ')} → ${cycle[0]}\n`);
    }
  }

  output += '\n  Stats:\n';
  if (maxFanOut.module) output += `    Max fan-out: ${maxFanOut.module} (${maxFanOut.count} imports)\n`;
  if (maxFanIn.module) output += `    Max fan-in:  ${maxFanIn.module} (imported by ${maxFanIn.count} modules)\n`;

  output += `\n  Mermaid diagram:\n\n`;
  output += '  ```mermaid\n';
  output += mermaidStr.split('\n').map(l => '  ' + l).join('\n') + '\n';
  output += '  ```\n';

  if (flags.output) {
    // Write raw mermaid to file (no color codes)
    const fileContent = `# Module Dependency Graph\n\nModules: ${stats.totalModules} | Edges: ${stats.totalEdges} | Cycles: ${stats.cycleCount}\n\n`
      + (cycles.length > 0 ? cycles.map(c => `⚠ Cycle: ${c.join(' → ')} → ${c[0]}`).join('\n') + '\n\n' : '')
      + '```mermaid\n' + mermaidStr + '\n```\n';
    writeFileSync(flags.output, fileContent, 'utf-8');
    console.log(pc.green(`Graph written to ${flags.output}`));
  } else {
    console.log(output);
  }

  if (cycles.length > 0) {
    console.log(pc.yellow('  Fix: use forwardRef() or extract shared logic into a SharedModule.'));
    console.log(pc.yellow('  Read: docs/guides/di-best-practices.md'));
    console.log('');
  } else {
    console.log(pc.green('  ✓ No circular dependencies detected.'));
    console.log('');
  }

  if (flags.strict && cycles.length > 0) {
    process.exit(1);
  }
}

// ── Main ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

// Handle `graph` subcommand — module dependency graph analyzer
if (args[0] === 'graph') {
  generateGraph(args.slice(1));
  process.exit(0);
}

// Handle `g resource <name>` subcommand
if (args[0] === 'g' || args[0] === 'generate') {
  if (args[1] === 'resource' && args[2]) {
    const resourceName = args[2];
    if (!/^[a-z][a-z0-9-]*$/.test(resourceName)) {
      console.error(pc.red('Error: resource name must be lowercase alphanumeric with hyphens.'));
      process.exit(1);
    }
    const flags = {
      crud: !args.includes('--minimal'),
      minimal: args.includes('--minimal'),
    };
    generateResource(resourceName, flags);
    process.exit(0);
  } else {
    console.error(pc.red('Usage: nestjs-boot g resource <name> [--crud|--minimal]'));
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
