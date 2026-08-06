import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';

const CLI_PATH = join(__dirname, '../../bin/create.mjs');

describe('CLI Scaffolding', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'nestjs-boot-cli-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function run(args: string): string {
    return execSync(`node ${CLI_PATH} ${args}`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
  }

  function readGenerated(projectName: string, filePath: string): string {
    return readFileSync(join(tempDir, projectName, filePath), 'utf-8');
  }

  it('creates project directory with all expected files', () => {
    run('new test-service');

    const projectDir = join(tempDir, 'test-service');
    expect(existsSync(projectDir)).toBe(true);

    const expectedFiles = [
      'src/main.ts',
      'src/app.module.ts',
      'src/app.controller.ts',
      'src/app.service.ts',
      'package.json',
      'tsconfig.json',
      '.env.example',
      '.env',
      'Dockerfile',
      'docker-compose.yml',
      'k8s/deployment.yaml',
      'k8s/service.yaml',
      'k8s/configmap.yaml',
      'k8s/hpa.yaml',
    ];

    for (const file of expectedFiles) {
      expect(existsSync(join(projectDir, file)), `missing: ${file}`).toBe(true);
    }

    // No proto dir by default
    expect(existsSync(join(projectDir, 'proto'))).toBe(false);
  });

  it('replaces template variables correctly', () => {
    run('new my-api');

    const mainTs = readGenerated('my-api', 'src/main.ts');
    expect(mainTs).toContain("'mongodb://localhost:27017/my-api'");
    expect(mainTs).toContain('my-api running on port');
    expect(mainTs).not.toContain('{{name}}');

    const pkgJson = readGenerated('my-api', 'package.json');
    const pkg = JSON.parse(pkgJson);
    expect(pkg.name).toBe('my-api');

    const service = readGenerated('my-api', 'src/app.service.ts');
    expect(service).toContain("service: 'my-api'");

    const dockerfile = readGenerated('my-api', 'Dockerfile');
    expect(dockerfile).not.toContain('{{name}}');

    const k8sDeploy = readGenerated('my-api', 'k8s/deployment.yaml');
    expect(k8sDeploy).toContain('name: my-api');
    expect(k8sDeploy).not.toContain('{{name}}');
  });

  it('--grpc flag adds proto file and transport config', () => {
    run('new grpc-svc --grpc');

    const projectDir = join(tempDir, 'grpc-svc');

    // Proto file created
    const protoPath = join(projectDir, 'proto', 'grpc-svc.proto');
    expect(existsSync(protoPath)).toBe(true);

    const proto = readFileSync(protoPath, 'utf-8');
    expect(proto).toContain('package grpc-svc');
    expect(proto).toContain('service grpc-svcService');

    // main.ts includes transport config
    const mainTs = readGenerated('grpc-svc', 'src/main.ts');
    expect(mainTs).toContain('transport:');
    expect(mainTs).toContain("url: '0.0.0.0:5000'");
    expect(mainTs).toContain("package: 'grpc-svc'");

    // .env has GRPC_URL
    const envExample = readGenerated('grpc-svc', '.env.example');
    expect(envExample).toContain('GRPC_URL');
  });

  it('--no-cache excludes Redis from config and docker-compose', () => {
    run('new no-cache-svc --no-cache');

    const mainTs = readGenerated('no-cache-svc', 'src/main.ts');
    expect(mainTs).not.toContain('cache:');
    expect(mainTs).not.toContain('redis');

    const compose = readGenerated('no-cache-svc', 'docker-compose.yml');
    expect(compose).not.toContain('redis');

    const envExample = readGenerated('no-cache-svc', '.env.example');
    expect(envExample).not.toContain('REDIS_URL');
  });

  it('--no-auth excludes auth from config', () => {
    run('new no-auth-svc --no-auth');

    const mainTs = readGenerated('no-auth-svc', 'src/main.ts');
    expect(mainTs).not.toContain('auth:');
    expect(mainTs).not.toContain('JWT_SECRET');

    const envExample = readGenerated('no-auth-svc', '.env.example');
    expect(envExample).not.toContain('JWT_SECRET');
  });

  it('rejects invalid project names', () => {
    expect(() => run('new MyService')).toThrow();
    expect(() => run('new 123bad')).toThrow();
    expect(() => run('new "has spaces"')).toThrow();
  });

  it('fails if directory already exists', () => {
    run('new duplicate-svc');
    expect(() => run('new duplicate-svc')).toThrow();
  });
});
