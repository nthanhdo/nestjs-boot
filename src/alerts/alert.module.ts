import { DynamicModule, Module, OnModuleInit } from '@nestjs/common';
import { ALERT_OPTIONS } from './constants';
import { AlertOptions } from './interfaces';
import { AlertService } from './alert.service';
import { ConsoleChannel } from './channels/console.channel';
import { WebhookChannel } from './channels/webhook.channel';
import { SlackChannel } from './channels/slack.channel';
import { DiscordChannel } from './channels/discord.channel';
import { PagerDutyChannel } from './channels/pagerduty.channel';
import { ModuleRef } from '@nestjs/core';

@Module({})
export class AlertModule implements OnModuleInit {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly alertService: AlertService,
  ) {}

  static register(options: AlertOptions): DynamicModule {
    return {
      module: AlertModule,
      global: true,
      providers: [
        { provide: ALERT_OPTIONS, useValue: options },
        AlertService,
      ],
      exports: [AlertService],
    };
  }

  onModuleInit() {
    const options = this.moduleRef.get<AlertOptions>(ALERT_OPTIONS);

    // Auto-register configured channels
    const channels = options?.channels;
    if (!channels) return;

    if (channels.console?.enabled !== false) {
      this.alertService.registerChannel(new ConsoleChannel());
    }
    if (channels.webhook) {
      this.alertService.registerChannel(
        new WebhookChannel(channels.webhook.url, channels.webhook.headers),
      );
    }
    if (channels.slack) {
      this.alertService.registerChannel(
        new SlackChannel(channels.slack.webhookUrl, channels.slack.channel),
      );
    }
    if (channels.discord) {
      this.alertService.registerChannel(new DiscordChannel(channels.discord.webhookUrl));
    }
    if (channels.pagerduty) {
      this.alertService.registerChannel(
        new PagerDutyChannel(channels.pagerduty.routingKey, channels.pagerduty.severity),
      );
    }
  }
}
