import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { detectCycles } from '../../src/graph/cycle-detector';
import { analyzeModules } from '../../src/graph/module-analyzer';
import { renderMermaid } from '../../src/graph/mermaid-renderer';

// ── detectCycles ───────────────────────────────────────────────────

describe('detectCycles', () => {
  it('should find a simple A→B→A cycle', () => {
    const nodes = ['A', 'B'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ];
    const cycles = detectCycles(nodes, edges);
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toContain('A');
    expect(cycles[0]).toContain('B');
  });

  it('should find a 3-node cycle A→B→C→A', () => {
    const nodes = ['A', 'B', 'C'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'A' },
    ];
    const cycles = detectCycles(nodes, edges);
    expect(cycles.length).toBe(1);
    expect(cycles[0].length).toBe(3);
    expect(cycles[0]).toContain('A');
    expect(cycles[0]).toContain('B');
    expect(cycles[0]).toContain('C');
  });

  it('should return empty array for acyclic graph', () => {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'D' },
      { from: 'C', to: 'D' },
    ];
    const cycles = detectCycles(nodes, edges);
    expect(cycles).toEqual([]);
  });

  it('should find multiple independent cycles', () => {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
      { from: 'C', to: 'D' },
      { from: 'D', to: 'C' },
    ];
    const cycles = detectCycles(nodes, edges);
    expect(cycles.length).toBe(2);
  });

  it('should handle isolated nodes with no edges', () => {
    const nodes = ['A', 'B', 'C'];
    const edges: { from: string; to: string }[] = [];
    const cycles = detectCycles(nodes, edges);
    expect(cycles).toEqual([]);
  });
});

// ── renderMermaid ──────────────────────────────────────────────────

describe('renderMermaid', () => {
  it('should highlight cycle nodes in red', () => {
    const result = {
      modules: [
        { name: 'OrderModule', filePath: '', imports: ['UserModule'], exports: [], providers: [] },
        { name: 'UserModule', filePath: '', imports: ['OrderModule'], exports: [], providers: [] },
        { name: 'AppModule', filePath: '', imports: ['OrderModule'], exports: [], providers: [] },
      ],
      edges: [
        { from: 'OrderModule', to: 'UserModule' },
        { from: 'UserModule', to: 'OrderModule' },
        { from: 'AppModule', to: 'OrderModule' },
      ],
      cycles: [['OrderModule', 'UserModule']],
      stats: {
        totalModules: 3,
        totalEdges: 3,
        maxFanOut: { module: 'AppModule', count: 1 },
        maxFanIn: { module: 'OrderModule', count: 2 },
        cycleCount: 1,
      },
    };

    const mermaid = renderMermaid(result);
    expect(mermaid).toContain('graph TD');
    expect(mermaid).toContain('OrderModule --> UserModule');
    expect(mermaid).toContain('UserModule --> OrderModule');
    expect(mermaid).toContain('style OrderModule fill:#ef4444');
    expect(mermaid).toContain('style UserModule fill:#ef4444');
    // Non-cycle node should NOT be styled red
    expect(mermaid).not.toContain('style AppModule fill:#ef4444');
  });

  it('should render isolated nodes', () => {
    const result = {
      modules: [
        { name: 'StandaloneModule', filePath: '', imports: [], exports: [], providers: [] },
      ],
      edges: [],
      cycles: [],
      stats: {
        totalModules: 1, totalEdges: 0,
        maxFanOut: { module: '', count: 0 },
        maxFanIn: { module: '', count: 0 },
        cycleCount: 0,
      },
    };
    const mermaid = renderMermaid(result);
    expect(mermaid).toContain('StandaloneModule[StandaloneModule]');
  });
});

// ── analyzeModules ─────────────────────────────────────────────────

describe('analyzeModules', () => {
  const tmpDir = join(__dirname, '__fixtures__');
  const srcDir = join(tmpDir, 'src');

  beforeAll(() => {
    mkdirSync(join(srcDir, 'order'), { recursive: true });
    mkdirSync(join(srcDir, 'user'), { recursive: true });
    mkdirSync(join(srcDir, 'notification'), { recursive: true });

    writeFileSync(
      join(srcDir, 'app.module.ts'),
      `import { Module } from '@nestjs/common';
import { OrderModule } from './order/order.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [OrderModule, UserModule],
  providers: [],
  exports: [],
})
export class AppModule {}
`,
    );

    writeFileSync(
      join(srcDir, 'order', 'order.module.ts'),
      `import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
`,
    );

    writeFileSync(
      join(srcDir, 'user', 'user.module.ts'),
      `import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
`,
    );

    writeFileSync(
      join(srcDir, 'notification', 'notification.module.ts'),
      `import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [OrderModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
`,
    );
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should parse @Module imports from TS source files', () => {
    const result = analyzeModules(tmpDir);
    expect(result.modules.length).toBe(4);
    const names = result.modules.map((m) => m.name).sort();
    expect(names).toEqual(['AppModule', 'NotificationModule', 'OrderModule', 'UserModule']);
  });

  it('should detect the cycle OrderModule→UserModule→NotificationModule→OrderModule', () => {
    const result = analyzeModules(tmpDir);
    expect(result.cycles.length).toBe(1);
    const cycle = result.cycles[0];
    expect(cycle).toContain('OrderModule');
    expect(cycle).toContain('UserModule');
    expect(cycle).toContain('NotificationModule');
  });

  it('should compute correct stats (max fan-out and fan-in)', () => {
    const result = analyzeModules(tmpDir);
    expect(result.stats.totalModules).toBe(4);
    // AppModule imports 2 = max fan-out
    expect(result.stats.maxFanOut.module).toBe('AppModule');
    expect(result.stats.maxFanOut.count).toBe(2);
  });

  it('should return empty result for non-existent project', () => {
    const result = analyzeModules('/tmp/does-not-exist-xyz');
    expect(result.modules).toEqual([]);
    expect(result.cycles).toEqual([]);
    expect(result.stats.totalModules).toBe(0);
  });
});
