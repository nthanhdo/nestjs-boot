import { describe, it, expect, vi, afterEach } from 'vitest';
import { StartupProfiler, createNoOpProfiler } from '../../src/di/startup-profiler';

describe('StartupProfiler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records phase durations and returns them via getResults()', async () => {
    const profiler = new StartupProfiler(true);

    profiler.startPhase('Config validation');
    await new Promise((r) => setTimeout(r, 5));
    profiler.endPhase();

    profiler.startPhase('NestFactory.create');
    await new Promise((r) => setTimeout(r, 5));
    profiler.endPhase();

    const results = profiler.getResults();

    expect(results).toHaveLength(2);
    expect(results[0].phase).toBe('Config validation');
    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(results[1].phase).toBe('NestFactory.create');
  });

  it('log() outputs [boot] prefix lines for each phase + total', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const profiler = new StartupProfiler(true);

    profiler.startPhase('OTel init');
    profiler.endPhase();

    profiler.startPhase('Transports');
    profiler.endPhase();

    profiler.log();

    const calls = consoleSpy.mock.calls.map((args) => args[0] as string);
    expect(calls.some((line) => line.startsWith('[boot] OTel init:'))).toBe(true);
    expect(calls.some((line) => line.startsWith('[boot] Transports:'))).toBe(true);
    expect(calls.some((line) => line.startsWith('[boot] Total:'))).toBe(true);
  });

  it('is disabled when NODE_ENV=production (no output)', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const profiler = new StartupProfiler(); // auto-detects production
    profiler.startPhase('SomePhase');
    profiler.endPhase();
    profiler.log();

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(profiler.getResults()).toHaveLength(0);
    expect(profiler.isEnabled()).toBe(false);

    process.env.NODE_ENV = original;
  });

  it('createNoOpProfiler() returns a profiler with zero overhead', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const profiler = createNoOpProfiler();

    profiler.startPhase('anything');
    profiler.endPhase();
    profiler.log();

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(profiler.getResults()).toHaveLength(0);
    expect(profiler.isEnabled()).toBe(false);
  });
});
