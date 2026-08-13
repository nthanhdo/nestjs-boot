import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ALERT_OPTIONS, DEFAULT_CHECK_INTERVAL, DEFAULT_COOLDOWN } from './constants';
import { AlertChannel, AlertOptions, AlertPayload, AlertRule } from './interfaces';
import { MetricsService } from '../metrics/metrics.service';

interface PendingAlert {
  rule: AlertRule;
  firstTriggered: number;
  fired: boolean;
}

@Injectable()
export class AlertService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertService.name);
  private readonly channels = new Map<string, AlertChannel>();
  private readonly rules = new Map<string, AlertRule>();
  private readonly activeAlerts: AlertPayload[] = [];
  private readonly cooldowns = new Map<string, number>(); // ruleName -> lastFiredTimestamp
  private readonly pending = new Map<string, PendingAlert>();
  private intervalRef?: ReturnType<typeof setInterval>;
  private readonly checkInterval: number;
  private readonly cooldown: number;

  constructor(
    @Inject(ALERT_OPTIONS) private readonly options: AlertOptions,
    @Optional() private readonly metricsService?: MetricsService,
  ) {
    this.checkInterval = options.checkInterval ?? DEFAULT_CHECK_INTERVAL;
    this.cooldown = options.cooldown ?? DEFAULT_COOLDOWN;
  }

  onModuleInit() {
    // Register initial rules from config
    if (this.options.rules) {
      for (const rule of this.options.rules) {
        this.rules.set(rule.name, rule);
      }
    }

    // Start periodic check if enabled and we have metrics
    if (this.options.enabled !== false && this.metricsService) {
      this.intervalRef = setInterval(() => this.checkRules(), this.checkInterval);
      this.logger.log(
        `Alert service started — ${this.rules.size} rules, ${this.channels.size} channels, interval=${this.checkInterval}ms`,
      );
    }
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = undefined;
    }
  }

  registerChannel(channel: AlertChannel): void {
    this.channels.set(channel.name, channel);
    this.logger.log(`Registered alert channel: ${channel.name}`);
  }

  addRule(rule: AlertRule): void {
    this.rules.set(rule.name, rule);
  }

  removeRule(name: string): void {
    this.rules.delete(name);
    this.pending.delete(name);
  }

  getActiveAlerts(): AlertPayload[] {
    return [...this.activeAlerts];
  }

  async checkRules(): Promise<void> {
    const registry = this.metricsService?.getRegistry();
    if (!registry) return;

    let metricsJson: any[];
    try {
      metricsJson = await registry.getMetricsAsJSON();
    } catch {
      return;
    }

    const metricValues = new Map<string, number>();
    for (const m of metricsJson) {
      if (m.values && m.values.length > 0) {
        // Use the sum of all label combinations for simplicity
        const total = m.values.reduce((acc: number, v: any) => acc + (v.value ?? 0), 0);
        metricValues.set(m.name, total);
      }
    }

    const now = Date.now();

    for (const [name, rule] of this.rules) {
      const value = metricValues.get(rule.metric);
      if (value === undefined) continue;

      const triggered = this.evaluateCondition(value, rule.condition, rule.threshold);

      if (triggered) {
        // Handle 'for' debounce
        if (rule.for && rule.for > 0) {
          const pendingEntry = this.pending.get(name);
          if (!pendingEntry) {
            this.pending.set(name, { rule, firstTriggered: now, fired: false });
            continue;
          }
          if (!pendingEntry.fired && now - pendingEntry.firstTriggered < rule.for * 1000) {
            continue;
          }
          if (pendingEntry.fired) continue;
          pendingEntry.fired = true;
        }

        // Check cooldown
        const lastFired = this.cooldowns.get(name);
        if (lastFired && now - lastFired < this.cooldown) continue;

        const payload: AlertPayload = {
          severity: rule.severity,
          title: rule.name,
          message: `${rule.metric} is ${value} (threshold: ${rule.condition} ${rule.threshold})`,
          metric: rule.metric,
          value,
          threshold: rule.threshold,
          timestamp: new Date(),
        };

        this.cooldowns.set(name, now);
        await this.sendAlert(payload, rule.channels);
      } else {
        // Condition cleared — reset pending
        this.pending.delete(name);
      }
    }
  }

  async sendAlert(payload: AlertPayload, channelNames?: string[]): Promise<void> {
    this.activeAlerts.push(payload);
    // Cap active alerts list
    if (this.activeAlerts.length > 1000) {
      this.activeAlerts.splice(0, this.activeAlerts.length - 1000);
    }

    const targets = channelNames
      ? channelNames.map((n) => this.channels.get(n)).filter(Boolean) as AlertChannel[]
      : Array.from(this.channels.values());

    if (targets.length === 0) {
      this.logger.warn(`No channels available for alert: ${payload.title}`);
      return;
    }

    await Promise.allSettled(
      targets.map((ch) =>
        ch.send(payload).catch((err) => {
          this.logger.error(`Channel ${ch.name} failed: ${(err as Error).message}`);
        }),
      ),
    );
  }

  private evaluateCondition(value: number, condition: 'gt' | 'lt' | 'eq', threshold: number): boolean {
    switch (condition) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }
}
