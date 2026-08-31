#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
let p, pc;
try {
  p = await import('@clack/prompts');
  pc = (await import('picocolors')).default;
} catch {
  console.error('Missing dependencies. Run: npm install @clack/prompts picocolors');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');
const PKG = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

// ── Option definitions ──────────────────────────────────────────────

const DB_OPTIONS = [
  { value: 'mongodb',  label: 'MongoDB (Mongoose)',    hint: 'default' },
  { value: 'postgres', label: 'PostgreSQL (Prisma)' },
  { value: 'none',     label: 'None' },
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
    if (arg === '--observability') { result.observability = true; continue; }
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
  --db=<type>         Database: mongodb, postgres, none
  --cache=<type>      Cache: redis, memcached, none
  --auth=<type>       Auth: jwt, none
  --transport=<type>  Transport: http, grpc, tcp, nats, rabbitmq
  --ci=<provider>     CI/CD: github (generates .github/workflows/ci.yml), gitlab (.gitlab-ci.yml)
  --iac=<cloud>       IaC: aws (ECS Fargate + DocumentDB + ElastiCache), gcp (Cloud Run + Atlas + Memorystore)
  --observability     Include Prometheus config, Grafana dashboards, Jaeger, Loki docker-compose
  -y, --yes           Accept all defaults (no prompts)
  -h, --help          Show this help message

${pc.bold('Generators:')}
  nestjs-boot g resource <name>  Generate a CRUD resource (schema, dto, service, controller, module, spec)
  nestjs-boot g auth             Generate a full auth module (user schema, DTOs, service, controller, module, spec)

${pc.bold('Examples:')}
  npx nestjs-boot new my-service
  npx nestjs-boot new my-service --db=mongodb --cache=redis --auth=jwt --transport=grpc
  npx nestjs-boot new my-service --ci=github
  npx nestjs-boot new my-service --iac=aws
  npx nestjs-boot new my-service --observability
  npx nestjs-boot new my-service -y
  npx nestjs-boot g resource product
  npx nestjs-boot g auth
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

function copyDirRecursive(src, dest) {
  const copied = [];
  if (!existsSync(src)) return copied;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copied.push(...copyDirRecursive(srcPath, destPath));
    } else {
      copyFileSync(srcPath, destPath);
      copied.push(destPath);
    }
  }
  return copied;
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
    { tpl: 'k8s/deployment.yaml',              out: 'k8s/deployment.yaml' },
    { tpl: 'k8s/service.yaml',                 out: 'k8s/service.yaml' },
    { tpl: 'k8s/configmap.yaml',               out: 'k8s/configmap.yaml' },
    { tpl: 'k8s/hpa.yaml',                     out: 'k8s/hpa.yaml' },
    { tpl: 'k8s/ingress.yaml',                 out: 'k8s/ingress.yaml' },
    { tpl: 'docker-compose.override.yml.tpl',  out: 'docker-compose.override.yml' },
    { tpl: 'docker-compose.prod.yml.tpl',     out: 'docker-compose.prod.yml' },
    { tpl: 'nginx.conf.tpl',                  out: 'nginx.conf' },
  ];

  // Add proto file if gRPC
  if (transport === 'grpc') {
    files.push({ tpl: 'proto.tpl', out: `proto/${name}.proto` });
  }

  // Add CI configuration if --ci flag is set
  const ciProvider = vars.ci || config?.ci;
  if (ciProvider === 'github') {
    files.push({ tpl: 'ci/github-actions.yml.tpl', out: '.github/workflows/ci.yml' });
  } else if (ciProvider === 'gitlab') {
    files.push({ tpl: 'ci/gitlab-ci.yml.tpl', out: '.gitlab-ci.yml' });
  }

  // Add observability stack if --observability flag is set
  if (config.observability) {
    const OBSERVABILITY_TEMPLATES_DIR = join(__dirname, '..', 'templates');
    const obsFiles = [
      { src: join(OBSERVABILITY_TEMPLATES_DIR, 'prometheus.yml'),                   out: 'observability/prometheus.yml' },
      { src: join(OBSERVABILITY_TEMPLATES_DIR, 'docker-compose.observability.yml'), out: 'docker-compose.observability.yml' },
      { src: join(OBSERVABILITY_TEMPLATES_DIR, 'grafana', 'http-overview.json'),    out: 'observability/grafana/dashboards/http-overview.json' },
      { src: join(OBSERVABILITY_TEMPLATES_DIR, 'grafana', 'service-health.json'),   out: 'observability/grafana/dashboards/service-health.json' },
      { src: join(OBSERVABILITY_TEMPLATES_DIR, 'grafana', 'microservice-overview.json'), out: 'observability/grafana/dashboards/microservice-overview.json' },
      { src: join(OBSERVABILITY_TEMPLATES_DIR, 'grafana', 'alerts.yml'),            out: 'observability/grafana/alerts.yml' },
    ];
    for (const { src, out } of obsFiles) {
      try {
        const content = readFileSync(src, 'utf-8');
        writeFile(join(projectDir, out), content);
        createdFiles.push(out);
      } catch {
        p.log.warn(`Could not copy observability template: ${src}`);
      }
    }
  }

  // Add IaC templates if --iac flag is set
  const iacProvider = config.iac;
  if (iacProvider === 'aws' || iacProvider === 'gcp') {
    const iacSrc = join(TEMPLATES_DIR, 'terraform', iacProvider);
    const iacDest = join(projectDir, 'infrastructure');
    const iacReadmeSrc = join(TEMPLATES_DIR, 'terraform', 'README.md');
    const copiedPaths = copyDirRecursive(iacSrc, iacDest);
    // Also copy the shared README
    if (existsSync(iacReadmeSrc)) {
      copyFileSync(iacReadmeSrc, join(iacDest, 'README.md'));
    }
  }

  // Copy deploy scripts
  const SCRIPTS_DIR = join(__dirname, '..', 'scripts');
  const deployScripts = ['deploy.sh', 'build-push.sh'];
  for (const script of deployScripts) {
    const src = join(SCRIPTS_DIR, script);
    if (existsSync(src)) {
      const dest = join(projectDir, 'scripts', script);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      try { execSync(`chmod +x "${dest}"`); } catch { /* Windows */ }
    }
  }

  const createdFiles = [];
  for (const { tpl, out } of files) {
    const template = loadTemplate(tpl);
    const rendered = renderTemplate(template, vars);
    writeFile(join(projectDir, out), rendered);
    createdFiles.push(out);
  }

  for (const script of deployScripts) {
    createdFiles.push(`scripts/${script}`);
  }

  // Generate prisma/schema.prisma for postgres projects
  if (db === 'postgres') {
    const prismaSchema = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;
    writeFile(join(projectDir, 'prisma', 'schema.prisma'), prismaSchema);
    createdFiles.push('prisma/schema.prisma');
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
  if (db === 'mongodb') dockerServices.push('MongoDB');
  if (db === 'postgres') dockerServices.push('PostgreSQL');
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

  if (config.iac) {
    console.log('');
    console.log(`  Infrastructure: ${pc.cyan(`cd ${name}/infrastructure`)}`);
    console.log(`    ${pc.cyan('terraform init && terraform plan')}  ${pc.dim(`# Preview ${config.iac.toUpperCase()} resources`)}`);
  }

  console.log('');
}

// ── Main ────────────────────────────────────────────────────────────

// ── Resource generator ─────────────────────────────────────────────

function generateAuth() {
  const dir = join(process.cwd(), 'src', 'auth');
  const driver = detectDbDriver();

  if (existsSync(dir)) {
    console.error(pc.red('Error: directory "src/auth" already exists.'));
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });

  // File: auth.dto.ts (shared between drivers)
  writeFile(join(dir, 'auth.dto.ts'), `import { IsEmail, IsString, IsNotEmpty, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsString()
  @IsOptional()
  name?: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
`);

  // File: auth.controller.ts (shared between drivers)
  writeFile(join(dir, 'auth.controller.ts'), `import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Public, CurrentUser } from 'nestjs-boot';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.name);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get('me')
  getProfile(@CurrentUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }
}
`);

  // File: auth.spec.ts (shared between drivers)
  writeFile(join(dir, 'auth.spec.ts'), `import { describe, it, expect } from 'vitest';
import { createTestApp, createTestClient } from 'nestjs-boot/testing';
import { UserAuthModule } from './auth.module';

describe('Auth', () => {
  it('should register and login', async () => {
    const app = await createTestApp({ imports: [UserAuthModule] });
    const client = createTestClient(app);

    const registerRes = await client.post('/auth/register').send({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.email).toBe('test@example.com');

    const loginRes = await client.post('/auth/login').send({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.refreshToken).toBeDefined();

    await app.close();
  });
});
`);

  if (driver === 'prisma') {
    // Prisma auth service — uses PrismaService instead of Mongoose
    writeFile(join(dir, 'auth.service.ts'), `import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService, BootJwtService } from 'nestjs-boot';

let bcrypt: any;
try {
  bcrypt = require('bcrypt');
} catch {
  try {
    bcrypt = require('bcryptjs');
  } catch {
    throw new Error('Auth requires bcrypt or bcryptjs. Install one: npm i bcrypt');
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: BootJwtService,
  ) {}

  async register(email: string, password: string, name?: string) {
    const existing = await this.prisma.client.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);
    const user = await this.prisma.client.user.create({
      data: { email: email.toLowerCase(), passwordHash, name },
    });

    return { id: user.id, email: user.email, name: user.name, roles: user.roles };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.client.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email, roles: user.roles, permissions: user.permissions };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.signRefresh(payload);

    await this.prisma.client.user.update({ where: { id: user.id }, data: { refreshToken } });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, roles: user.roles },
    };
  }

  async refreshToken(oldRefreshToken: string) {
    const { accessToken, refreshToken } = this.jwt.rotateRefreshToken(oldRefreshToken);
    const decoded = this.jwt.verifyRefresh<{ sub: string }>(refreshToken);
    await this.prisma.client.user.updateMany({
      where: { id: decoded.sub, refreshToken: oldRefreshToken },
      data: { refreshToken },
    });
    return { accessToken, refreshToken };
  }

  async logout(userId: string) {
    await this.prisma.client.user.update({ where: { id: userId }, data: { refreshToken: null } });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.client.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return; // Silent — don't reveal user existence

    const token = this.jwt.signPasswordReset(user.id);
    const resetUrl = \`/auth/reset-password?token=\${token}\`;

    // TODO: Replace with your email provider (SendGrid, SES, etc.)
    this.logger.warn('========================================');
    this.logger.warn('PASSWORD RESET TOKEN (dev mode)');
    this.logger.warn(\`User: \${email}\`);
    this.logger.warn(\`Token: \${token}\`);
    this.logger.warn(\`URL: \${resetUrl}\`);
    this.logger.warn('========================================');
  }

  async resetPassword(token: string, newPassword: string) {
    const { sub } = this.jwt.verifyPasswordReset(token);
    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    await this.prisma.client.user.update({ where: { id: sub }, data: { passwordHash, refreshToken: null } });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, roles: true, permissions: true, emailVerified: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }
}
`);

    // Prisma auth module — no MongooseModule.forFeature
    writeFile(join(dir, 'auth.module.ts'), `import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class UserAuthModule {}
`);

    const prismaFiles = [
      'src/auth/auth.dto.ts',
      'src/auth/auth.service.ts',
      'src/auth/auth.controller.ts',
      'src/auth/auth.module.ts',
      'src/auth/auth.spec.ts',
    ];

    console.log('');
    console.log(pc.green(pc.bold('Auth module generated! (Prisma)')));
    console.log('');
    for (const f of prismaFiles) {
      console.log(`  ${pc.dim('created')} ${f}`);
    }
    console.log('');
    console.log(`  ${pc.cyan('Next steps:')}`);
    console.log(`    1. Install: npm i bcrypt && npm i -D @types/bcrypt`);
    console.log(`       (or: npm i bcryptjs && npm i -D @types/bcryptjs)`);
    console.log(`    2. Add User model to prisma/schema.prisma with fields:`);
    console.log(`       id, email, passwordHash, name, roles, permissions, refreshToken, emailVerified, createdAt, updatedAt`);
    console.log(`    3. Run: npx prisma generate && npx prisma migrate dev`);
    console.log(`    4. Import UserAuthModule in your AppModule`);
    console.log(`    5. Ensure BootJwtModule is configured in your AppModule`);
    console.log(`    6. Replace the forgotPassword console.warn with your email provider`);
    console.log('');
    return;
  }

  // Mongoose auth path (default)

  // File: user.schema.ts
  writeFile(join(dir, 'user.schema.ts'), `import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ trim: true })
  name: string;

  @Prop({ type: [String], default: ['user'] })
  roles: string[];

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop()
  refreshToken?: string;

  @Prop({ default: false })
  emailVerified: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true });
`);

  // File: auth.service.ts
  writeFile(join(dir, 'auth.service.ts'), `import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BootJwtService } from 'nestjs-boot';
import { User, UserDocument } from './user.schema';

let bcrypt: any;
try {
  bcrypt = require('bcrypt');
} catch {
  try {
    bcrypt = require('bcryptjs');
  } catch {
    throw new Error('Auth requires bcrypt or bcryptjs. Install one: npm i bcrypt');
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 10;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwt: BootJwtService,
  ) {}

  async register(email: string, password: string, name?: string) {
    const existing = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);
    const user = await this.userModel.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
    });

    return { id: user._id, email: user.email, name: user.name, roles: user.roles };
  }

  async login(email: string, password: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user._id.toString(), email: user.email, roles: user.roles, permissions: user.permissions };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.signRefresh(payload);

    user.refreshToken = refreshToken;
    await user.save();

    return {
      accessToken,
      refreshToken,
      user: { id: user._id, email: user.email, name: user.name, roles: user.roles },
    };
  }

  async refreshToken(oldRefreshToken: string) {
    const { accessToken, refreshToken } = this.jwt.rotateRefreshToken(oldRefreshToken);

    const decoded = this.jwt.verifyRefresh<{ sub: string }>(refreshToken);
    await this.userModel.updateOne(
      { _id: decoded.sub, refreshToken: oldRefreshToken },
      { refreshToken },
    );

    return { accessToken, refreshToken };
  }

  async logout(userId: string) {
    await this.userModel.updateOne({ _id: userId }, { $unset: { refreshToken: 1 } });
  }

  async forgotPassword(email: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) return; // Silent — don't reveal user existence

    const token = this.jwt.signPasswordReset(user._id.toString());
    const resetUrl = \`/auth/reset-password?token=\${token}\`;

    // TODO: Replace with your email provider (SendGrid, SES, etc.)
    this.logger.warn('========================================');
    this.logger.warn('PASSWORD RESET TOKEN (dev mode)');
    this.logger.warn(\`User: \${email}\`);
    this.logger.warn(\`Token: \${token}\`);
    this.logger.warn(\`URL: \${resetUrl}\`);
    this.logger.warn('========================================');
  }

  async resetPassword(token: string, newPassword: string) {
    const { sub } = this.jwt.verifyPasswordReset(token);
    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    await this.userModel.updateOne({ _id: sub }, { passwordHash, $unset: { refreshToken: 1 } });
  }

  async getProfile(userId: string) {
    const user = await this.userModel.findById(userId).select('-passwordHash -refreshToken');
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }
}
`);

  // File: auth.module.ts
  writeFile(join(dir, 'auth.module.ts'), `import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class UserAuthModule {}
`);

  const files = [
    'src/auth/user.schema.ts',
    'src/auth/auth.dto.ts',
    'src/auth/auth.service.ts',
    'src/auth/auth.controller.ts',
    'src/auth/auth.module.ts',
    'src/auth/auth.spec.ts',
  ];

  console.log('');
  console.log(pc.green(pc.bold('Auth module generated!')));
  console.log('');
  for (const f of files) {
    console.log(`  ${pc.dim('created')} ${f}`);
  }
  console.log('');
  console.log(`  ${pc.cyan('Next steps:')}`);
  console.log(`    1. Install: npm i bcrypt && npm i -D @types/bcrypt`);
  console.log(`       (or: npm i bcryptjs && npm i -D @types/bcryptjs)`);
  console.log(`    2. Import UserAuthModule in your AppModule`);
  console.log(`    3. Ensure BootJwtModule is configured in your AppModule`);
  console.log(`    4. Replace the forgotPassword console.warn with your email provider`);
  console.log('');
}

function detectDbDriver() {
  // Check if prisma/ directory exists (Prisma project)
  if (existsSync(join(process.cwd(), 'prisma'))) return 'prisma';
  // Check package.json for mongoose or @prisma/client
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    if (pkg.dependencies?.['@prisma/client']) return 'prisma';
    if (pkg.dependencies?.mongoose) return 'mongoose';
  } catch {}
  return 'mongoose'; // default
}

function generateResource(name, flags = {}) {
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  const lower = name.toLowerCase();
  const dir = join(process.cwd(), 'src', lower);
  const isCrud = flags.crud !== false; // default: full CRUD
  const isMinimal = flags.minimal === true;
  const driver = detectDbDriver();

  if (existsSync(dir)) {
    console.error(pc.red(`Error: directory "src/${lower}" already exists.`));
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });

  // DTO — with class-validator decorators (shared between drivers)
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

  if (driver === 'prisma') {
    // Prisma path — no schema.ts file

    if (isMinimal) {
      writeFile(join(dir, `${lower}.service.ts`), `import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-boot';

@Injectable()
export class ${pascal}Service {
  constructor(private readonly prisma: PrismaService) {}
}
`);

      writeFile(join(dir, `${lower}.module.ts`), `import { Module } from '@nestjs/common';
import { ${pascal}Service } from './${lower}.service';

@Module({
  providers: [${pascal}Service],
  exports: [${pascal}Service],
})
export class ${pascal}Module {}
`);

      const files = [
        `src/${lower}/${lower}.dto.ts`,
        `src/${lower}/${lower}.service.ts`,
        `src/${lower}/${lower}.module.ts`,
      ];

      console.log('');
      console.log(pc.green(pc.bold(`Resource "${lower}" generated! (minimal, Prisma)`)));
      console.log('');
      for (const f of files) {
        console.log(`  ${pc.dim('created')} ${f}`);
      }
      console.log('');
      console.log(`  ${pc.cyan('Next:')}`);
      console.log(`    1. Add ${lower} model to prisma/schema.prisma`);
      console.log(`    2. Run: npx prisma generate`);
      console.log(`    3. Import ${pascal}Module in your AppModule`);
      console.log('');
      return;
    }

    // Full Prisma resource
    writeFile(join(dir, `${lower}.service.ts`), `import { Injectable } from '@nestjs/common';
import { PrismaCrudService } from 'nestjs-boot';
import { PrismaService } from 'nestjs-boot';
import { Create${pascal}Dto, Update${pascal}Dto } from './${lower}.dto';

@Injectable()
export class ${pascal}Service extends PrismaCrudService<Create${pascal}Dto, Update${pascal}Dto> {
  constructor(private readonly prisma: PrismaService) {
    super(prisma, '${lower}');
  }
}
`);

    writeFile(join(dir, `${lower}.controller.ts`), `import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { Public, Permissions } from 'nestjs-boot';
import { ${pascal}Service } from './${lower}.service';
import { Create${pascal}Dto, Update${pascal}Dto } from './${lower}.dto';

@Controller('${lower}s')
export class ${pascal}Controller {
  constructor(private readonly service: ${pascal}Service) {}

  @Permissions('${lower}.create')
  @Post()
  create(@Body() dto: Create${pascal}Dto) {
    return this.service.create(dto);
  }

  @Permissions('${lower}.read')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Permissions('${lower}.read')
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Permissions('${lower}.update')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Update${pascal}Dto) {
    return this.service.update(id, dto);
  }

  @Permissions('${lower}.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
`);

    writeFile(join(dir, `${lower}.module.ts`), `import { Module } from '@nestjs/common';
import { ${pascal}Service } from './${lower}.service';
import { ${pascal}Controller } from './${lower}.controller';

@Module({
  controllers: [${pascal}Controller],
  providers: [${pascal}Service],
  exports: [${pascal}Service],
})
export class ${pascal}Module {}
`);

    writeFile(join(dir, `${lower}.spec.ts`), `import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp } from 'nestjs-boot/testing';
import type { TestAppContext } from 'nestjs-boot/testing';
import { ${pascal}Module } from './${lower}.module';
import { ${pascal}Service } from './${lower}.service';

describe('${pascal}Service', () => {
  let ctx: TestAppContext;
  let service: ${pascal}Service;

  beforeAll(async () => {
    ctx = await createTestApp(${pascal}Module);
    service = ctx.app.get(${pascal}Service);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
`);

    console.log('');
    console.log(pc.green(pc.bold(`Resource "${lower}" generated! (Prisma)`)));
    console.log('');
    const prismaFiles = [
      `src/${lower}/${lower}.dto.ts`,
      `src/${lower}/${lower}.service.ts`,
      `src/${lower}/${lower}.controller.ts`,
      `src/${lower}/${lower}.module.ts`,
      `src/${lower}/${lower}.spec.ts`,
    ];
    for (const f of prismaFiles) {
      console.log(`  ${pc.dim('created')} ${f}`);
    }
    console.log('');
    console.log(`  ${pc.cyan('Next:')}`);
    console.log(`    1. Add ${lower} model to prisma/schema.prisma`);
    console.log(`    2. Run: npx prisma generate`);
    console.log(`    3. Import ${pascal}Module in your AppModule`);
    console.log('');
    return;
  }

  // Mongoose path (default)

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

// ── Migration CLI ────────────────────────────────────────────────────

/**
 * Generate a timestamped migration file.
 * Usage: nestjs-boot migrate:create <name>
 */
async function migrationCreate(name) {
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    console.error(pc.red('Error: migration name must be lowercase alphanumeric with hyphens (e.g. add-email-index).'));
    process.exit(1);
  }

  const migrationsDir = join(process.cwd(), 'migrations');
  if (!existsSync(migrationsDir)) {
    mkdirSync(migrationsDir, { recursive: true });
  }

  // Version = date + sequence, e.g. 2026-08-07-001
  const today = new Date().toISOString().slice(0, 10);
  const existing = readdirSync(migrationsDir).filter(f => f.startsWith(today)).length;
  const seq = String(existing + 1).padStart(3, '0');
  const version = `${today}-${seq}`;
  const filename = `${version}-${name}.ts`;
  const filepath = join(migrationsDir, filename);

  const template = `import type { Migration } from 'nestjs-boot';

export const migration: Migration = {
  version: '${version}',
  name: '${name}',

  async up(db) {
    // TODO: apply migration
    // Example: await db.collection('users').createIndex({ email: 1 }, { unique: true });
  },

  async down(db) {
    // TODO: rollback migration
    // Example: await db.collection('users').dropIndex('email_1');
  },
};
`;

  writeFileSync(filepath, template, 'utf-8');
  console.log(pc.green(`✓ Created migration: migrations/${filename}`));
}

/**
 * Load migrations from the project's `migrations/` directory and run a runner command.
 * Requires the project to have a nestjs-boot app with MigrationRunner exported.
 *
 * For projects that expose a runner via a bootstrap script, this delegates to that.
 * For simple cases, we dynamically load migration files and use MigrationRunner directly.
 */
async function runMigrationCommand(command) {
  const { pathToFileURL } = await import('url');
  const migrationsDir = join(process.cwd(), 'migrations');

  if (!existsSync(migrationsDir)) {
    console.error(pc.yellow(`No migrations directory found at ${migrationsDir}`));
    console.log(pc.dim(`Run: nestjs-boot migrate:create <name> to create your first migration.`));
    process.exit(0);
  }

  // Load migration files (compiled JS in dist/migrations or TS via tsx/ts-node)
  const distDir = join(process.cwd(), 'dist', 'migrations');
  const loadDir = existsSync(distDir) ? distDir : migrationsDir;
  const ext = existsSync(distDir) ? '.js' : '.ts';

  const files = readdirSync(loadDir)
    .filter(f => f.endsWith(ext) && !f.endsWith('.d.ts'))
    .sort();

  if (files.length === 0) {
    console.log(pc.dim('No migration files found.'));
    process.exit(0);
  }

  const migrations = [];
  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(join(loadDir, file)).href);
      const m = mod.migration ?? mod.default;
      if (m && m.version && m.name && typeof m.up === 'function') {
        migrations.push(m);
      }
    } catch (err) {
      console.error(pc.red(`Failed to load ${file}: ${err.message}`));
      if (ext === '.ts') {
        console.log(pc.dim('Tip: build first with `tsc` or use `ts-node` / `tsx` to run migrations.'));
      }
      process.exit(1);
    }
  }

  // Load mongoose connection from environment
  let mongoose;
  try {
    mongoose = (await import('mongoose')).default ?? (await import('mongoose'));
  } catch {
    console.error(pc.red('mongoose is not installed. Add it as a dependency.'));
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.error(pc.red('Set MONGODB_URI or DATABASE_URL environment variable.'));
    process.exit(1);
  }

  let conn;
  try {
    conn = await mongoose.createConnection(uri).asPromise();
  } catch (err) {
    console.error(pc.red(`Failed to connect to MongoDB: ${err.message}`));
    process.exit(1);
  }

  // Dynamically import MigrationRunner from the built dist or source
  let MigrationRunner;
  try {
    const pkg = await import(pathToFileURL(join(process.cwd(), 'node_modules', 'nestjs-boot', 'dist', 'index.js')).href);
    MigrationRunner = pkg.MigrationRunner;
  } catch {
    // Running from the library itself during dev
    try {
      const src = await import(pathToFileURL(join(__dirname, '..', 'dist', 'index.js')).href);
      MigrationRunner = src.MigrationRunner;
    } catch {
      console.error(pc.red('Could not load MigrationRunner. Run `pnpm build` first.'));
      await conn.close();
      process.exit(1);
    }
  }

  const runner = new MigrationRunner(conn, migrations);

  try {
    if (command === 'migrate') {
      const results = await runner.migrate();
      if (results.length === 0) {
        console.log(pc.green('✓ All migrations are up to date.'));
      } else {
        for (const r of results) {
          const icon = r.status === 'applied' ? pc.green('✓') : pc.red('✗');
          console.log(`${icon} [${r.version}] ${r.name} — ${r.status} (${r.durationMs}ms)`);
          if (r.error) console.log(pc.red(`  Error: ${r.error}`));
        }
      }
    } else if (command === 'migrate:rollback') {
      const count = parseInt(process.argv[3] || '1', 10);
      const results = await runner.rollback(count);
      if (results.length === 0) {
        console.log(pc.yellow('Nothing to rollback.'));
      } else {
        for (const r of results) {
          const icon = r.status === 'rolled_back' ? pc.green('↩') : r.status === 'skipped' ? pc.yellow('–') : pc.red('✗');
          console.log(`${icon} [${r.version}] ${r.name} — ${r.status}`);
          if (r.error) console.log(pc.dim(`  ${r.error}`));
        }
      }
    } else if (command === 'migrate:status') {
      const statuses = await runner.status();
      console.log('');
      console.log(pc.bold('Migration Status'));
      console.log('─'.repeat(60));
      for (const s of statuses) {
        const badge = s.pending ? pc.yellow('PENDING') : pc.green('APPLIED');
        const date = s.appliedAt ? pc.dim(s.appliedAt.toISOString().slice(0, 19).replace('T', ' ')) : '';
        console.log(`  ${badge}  [${s.version}] ${s.name} ${date}`);
      }
      console.log('');
    }
  } finally {
    await conn.close();
  }
}

// ── Main ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

// Handle migrate subcommands
if (args[0] === 'migrate:create') {
  await migrationCreate(args[1]);
  process.exit(0);
}
if (args[0] === 'migrate' || args[0] === 'migrate:rollback' || args[0] === 'migrate:status') {
  await runMigrationCommand(args[0]);
  process.exit(0);
}

// Handle `graph` subcommand — module dependency graph analyzer
if (args[0] === 'graph') {
  generateGraph(args.slice(1));
  process.exit(0);
}

// Handle `g resource <name>` and `g auth` subcommands
if (args[0] === 'g' || args[0] === 'generate') {
  if (args[1] === 'auth') {
    generateAuth();
    process.exit(0);
  } else if (args[1] === 'resource' && args[2]) {
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
    console.error(pc.red('Usage:'));
    console.error(pc.red('  nestjs-boot g resource <name> [--crud|--minimal]'));
    console.error(pc.red('  nestjs-boot g auth'));
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
