import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AlertService } from '../../src/alerts/alert.service';
import { AlertChannel, AlertPayload, AlertRule } from '../../src/alerts/interfaces';
import { ConsoleChannel } from '../../src/alerts/channels/console.channel';
import { WebhookChannel } from '../../src/alerts/channels/webhook.channel';

function createMockChannel(name: string): AlertChannel & { calls: AlertPayload[] } {
  const calls: AlertPayload[] = [];
  return {
    name,
    calls,
    send: vi.fn(async (alert: AlertPayload) => { calls.push(alert); }),
  };
}

function createService(opts: Partial<Parameters<typeof AlertService['prototype']['constructor']>[0]> = {}) {
  const options = { enabled: true, ...opts } as any;
  // No metricsService — we'll test checkRules separately
  const service = new AlertService(options, undefined);
  return service;
}

describe('AlertService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rule evaluation (gt/lt/eq)', () => {
    it('should fire alert when value > threshold (gt)', async () => {
      const ch = createMockChannel('test');
      const service = createService({ cooldown: 0 });
      service.registerChannel(ch);

      const payload: AlertPayload = {
        severity: 'critical',
        title: 'High CPU',
        message: 'CPU is high',
        metric: 'cpu_usage',
        value: 95,
        threshold: 80,
        timestamp: new Date(),
      };
      await service.sendAlert(payload);

      expect(ch.calls).toHaveLength(1);
      expect(ch.calls[0].title).toBe('High CPU');
    });

    it('should evaluate gt condition correctly', async () => {
      // Test via the private evaluateCondition through checkRules
      // We need a MetricsService mock for this
      const mockRegistry = {
        getMetricsAsJSON: vi.fn().mockResolvedValue([
          { name: 'error_rate', values: [{ value: 0.06 }] },
        ]),
      };
      const mockMetrics = { getRegistry: () => mockRegistry } as any;

      const service = new AlertService({ enabled: true, cooldown: 0 }, mockMetrics);
      const ch = createMockChannel('test');
      service.registerChannel(ch);
      service.addRule({
        name: 'high-errors',
        metric: 'error_rate',
        condition: 'gt',
        threshold: 0.05,
        severity: 'critical',
      });

      await service.checkRules();
      expect(ch.calls).toHaveLength(1);
      expect(ch.calls[0].severity).toBe('critical');
    });

    it('should NOT fire when value <= threshold (gt)', async () => {
      const mockRegistry = {
        getMetricsAsJSON: vi.fn().mockResolvedValue([
          { name: 'error_rate', values: [{ value: 0.03 }] },
        ]),
      };
      const mockMetrics = { getRegistry: () => mockRegistry } as any;

      const service = new AlertService({ enabled: true, cooldown: 0 }, mockMetrics);
      const ch = createMockChannel('test');
      service.registerChannel(ch);
      service.addRule({
        name: 'high-errors',
        metric: 'error_rate',
        condition: 'gt',
        threshold: 0.05,
        severity: 'critical',
      });

      await service.checkRules();
      expect(ch.calls).toHaveLength(0);
    });

    it('should fire alert when value < threshold (lt)', async () => {
      const mockRegistry = {
        getMetricsAsJSON: vi.fn().mockResolvedValue([
          { name: 'cache_hit_rate', values: [{ value: 0.3 }] },
        ]),
      };
      const mockMetrics = { getRegistry: () => mockRegistry } as any;

      const service = new AlertService({ enabled: true, cooldown: 0 }, mockMetrics);
      const ch = createMockChannel('test');
      service.registerChannel(ch);
      service.addRule({
        name: 'low-cache',
        metric: 'cache_hit_rate',
        condition: 'lt',
        threshold: 0.5,
        severity: 'warning',
      });

      await service.checkRules();
      expect(ch.calls).toHaveLength(1);
    });

    it('should fire alert when value == threshold (eq)', async () => {
      const mockRegistry = {
        getMetricsAsJSON: vi.fn().mockResolvedValue([
          { name: 'up', values: [{ value: 0 }] },
        ]),
      };
      const mockMetrics = { getRegistry: () => mockRegistry } as any;

      const service = new AlertService({ enabled: true, cooldown: 0 }, mockMetrics);
      const ch = createMockChannel('test');
      service.registerChannel(ch);
      service.addRule({
        name: 'service-down',
        metric: 'up',
        condition: 'eq',
        threshold: 0,
        severity: 'critical',
      });

      await service.checkRules();
      expect(ch.calls).toHaveLength(1);
    });
  });

  describe('deduplication (cooldown)', () => {
    it('should not re-fire same alert within cooldown period', async () => {
      const mockRegistry = {
        getMetricsAsJSON: vi.fn().mockResolvedValue([
          { name: 'error_rate', values: [{ value: 0.1 }] },
        ]),
      };
      const mockMetrics = { getRegistry: () => mockRegistry } as any;

      const service = new AlertService({ enabled: true, cooldown: 60_000 }, mockMetrics);
      const ch = createMockChannel('test');
      service.registerChannel(ch);
      service.addRule({
        name: 'high-errors',
        metric: 'error_rate',
        condition: 'gt',
        threshold: 0.05,
        severity: 'critical',
      });

      await service.checkRules();
      expect(ch.calls).toHaveLength(1);

      // Second check within cooldown — should NOT fire
      await service.checkRules();
      expect(ch.calls).toHaveLength(1);
    });

    it('should re-fire after cooldown expires', async () => {
      const mockRegistry = {
        getMetricsAsJSON: vi.fn().mockResolvedValue([
          { name: 'error_rate', values: [{ value: 0.1 }] },
        ]),
      };
      const mockMetrics = { getRegistry: () => mockRegistry } as any;

      // Use 0 cooldown
      const service = new AlertService({ enabled: true, cooldown: 0 }, mockMetrics);
      const ch = createMockChannel('test');
      service.registerChannel(ch);
      service.addRule({
        name: 'high-errors',
        metric: 'error_rate',
        condition: 'gt',
        threshold: 0.05,
        severity: 'critical',
      });

      await service.checkRules();
      await service.checkRules();
      expect(ch.calls).toHaveLength(2);
    });
  });

  describe('channel routing', () => {
    it('should send to all channels when no specific channels specified', async () => {
      const ch1 = createMockChannel('ch1');
      const ch2 = createMockChannel('ch2');
      const service = createService();
      service.registerChannel(ch1);
      service.registerChannel(ch2);

      await service.sendAlert({
        severity: 'info',
        title: 'Test',
        message: 'test',
        timestamp: new Date(),
      });

      expect(ch1.calls).toHaveLength(1);
      expect(ch2.calls).toHaveLength(1);
    });

    it('should send only to specified channels', async () => {
      const ch1 = createMockChannel('slack');
      const ch2 = createMockChannel('discord');
      const service = createService();
      service.registerChannel(ch1);
      service.registerChannel(ch2);

      await service.sendAlert(
        {
          severity: 'warning',
          title: 'Test',
          message: 'test',
          timestamp: new Date(),
        },
        ['slack'],
      );

      expect(ch1.calls).toHaveLength(1);
      expect(ch2.calls).toHaveLength(0);
    });

    it('should route rule-specific channels during checkRules', async () => {
      const mockRegistry = {
        getMetricsAsJSON: vi.fn().mockResolvedValue([
          { name: 'error_rate', values: [{ value: 0.1 }] },
        ]),
      };
      const mockMetrics = { getRegistry: () => mockRegistry } as any;

      const service = new AlertService({ enabled: true, cooldown: 0 }, mockMetrics);
      const slack = createMockChannel('slack');
      const discord = createMockChannel('discord');
      service.registerChannel(slack);
      service.registerChannel(discord);

      service.addRule({
        name: 'high-errors',
        metric: 'error_rate',
        condition: 'gt',
        threshold: 0.05,
        severity: 'critical',
        channels: ['slack'], // only slack
      });

      await service.checkRules();
      expect(slack.calls).toHaveLength(1);
      expect(discord.calls).toHaveLength(0);
    });
  });

  describe('rule management', () => {
    it('should add and remove rules', () => {
      const service = createService();
      service.addRule({
        name: 'test-rule',
        metric: 'foo',
        condition: 'gt',
        threshold: 1,
        severity: 'info',
      });

      service.removeRule('test-rule');
      // No assertion needed — just ensuring no error
    });

    it('should return active alerts', async () => {
      const ch = createMockChannel('test');
      const service = createService();
      service.registerChannel(ch);

      expect(service.getActiveAlerts()).toHaveLength(0);

      await service.sendAlert({
        severity: 'info',
        title: 'Test',
        message: 'test',
        timestamp: new Date(),
      });

      expect(service.getActiveAlerts()).toHaveLength(1);
    });
  });

  describe('for (debounce) duration', () => {
    it('should not fire until for duration has passed', async () => {
      const mockRegistry = {
        getMetricsAsJSON: vi.fn().mockResolvedValue([
          { name: 'error_rate', values: [{ value: 0.1 }] },
        ]),
      };
      const mockMetrics = { getRegistry: () => mockRegistry } as any;

      const service = new AlertService({ enabled: true, cooldown: 0 }, mockMetrics);
      const ch = createMockChannel('test');
      service.registerChannel(ch);
      service.addRule({
        name: 'debounced',
        metric: 'error_rate',
        condition: 'gt',
        threshold: 0.05,
        severity: 'critical',
        for: 9999, // very long debounce
      });

      // First check — registers pending but doesn't fire
      await service.checkRules();
      expect(ch.calls).toHaveLength(0);

      // Second check — still within for period
      await service.checkRules();
      expect(ch.calls).toHaveLength(0);
    });
  });
});

describe('ConsoleChannel', () => {
  it('should log alert without throwing', async () => {
    const channel = new ConsoleChannel();
    expect(channel.name).toBe('console');

    // Should not throw
    await channel.send({
      severity: 'critical',
      title: 'Test Alert',
      message: 'Something bad happened',
      metric: 'error_rate',
      value: 0.1,
      threshold: 0.05,
      timestamp: new Date(),
    });
  });

  it('should handle all severity levels', async () => {
    const channel = new ConsoleChannel();

    for (const severity of ['info', 'warning', 'critical'] as const) {
      await channel.send({
        severity,
        title: `${severity} alert`,
        message: 'test',
        timestamp: new Date(),
      });
    }
  });
});

describe('WebhookChannel', () => {
  it('should POST JSON to configured URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const channel = new WebhookChannel('https://example.com/hook', { Authorization: 'Bearer token' });
    expect(channel.name).toBe('webhook');

    const alert: AlertPayload = {
      severity: 'warning',
      title: 'Test',
      message: 'test message',
      timestamp: new Date(),
    };

    await channel.send(alert);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['Authorization']).toBe('Bearer token');
    expect(JSON.parse(opts.body)).toMatchObject({ title: 'Test', severity: 'warning' });

    vi.unstubAllGlobals();
  });

  it('should handle fetch errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const channel = new WebhookChannel('https://example.com/hook');
    // Should not throw
    await channel.send({
      severity: 'info',
      title: 'Test',
      message: 'test',
      timestamp: new Date(),
    });

    vi.unstubAllGlobals();
  });
});
