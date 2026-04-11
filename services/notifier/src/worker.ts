import type { PrismaClient } from '@flight-hunter/shared/db';
import type { AlertJob } from '@flight-hunter/shared';
import type { TelegramChannel } from './channels/telegram.js';
import type { EmailChannel } from './channels/email.js';
import type { WebSocketBroadcaster } from './channels/websocket.js';
import type { WebhookChannel } from './channels/webhook.js';
import type { SlackChannel } from './channels/slack.js';
import type { DiscordChannel } from './channels/discord.js';
import type { Throttle } from './throttle.js';
import { formatTelegram } from './formatter/telegram-fmt.js';
import { formatEmail } from './formatter/email-fmt.js';
import { formatWebSocket } from './formatter/ws-fmt.js';
import { formatSlack } from './formatter/slack-fmt.js';
import { formatDiscord } from './formatter/discord-fmt.js';
import { getChannelsForLevel } from './rules.js';
import {
  isEmailsPaused,
  getWebhookConfig,
  getSlackWebhookUrl,
  getDiscordWebhookUrl,
} from './settings-cache.js';
import { createWebhookChannel } from './channels/webhook.js';
import { createSlackChannel } from './channels/slack.js';
import { createDiscordChannel } from './channels/discord.js';

export interface NotifierDeps {
  telegram: TelegramChannel;
  email: EmailChannel;
  wsBroadcaster: WebSocketBroadcaster;
  throttle: Throttle;
  prisma: PrismaClient;
  /** Window (ms) within which a (searchId, flightResultId, level) tuple is
   * considered already alerted. Default 6 hours. */
  dedupTtlMs?: number;
  /** Optional override for webhook channel (for testing). If not provided, created dynamically from settings. */
  webhook?: WebhookChannel | null;
  /** Optional override for slack channel (for testing). If not provided, created dynamically from settings. */
  slack?: SlackChannel | null;
  /** Optional override for discord channel (for testing). If not provided, created dynamically from settings. */
  discord?: DiscordChannel | null;
}

function buildFingerprint(alert: AlertJob): string {
  const { flightSummary } = alert;
  return [
    alert.searchId,
    flightSummary.airline,
    flightSummary.departureAirport,
    flightSummary.arrivalAirport,
    flightSummary.departureTime,
    flightSummary.arrivalTime,
    String(flightSummary.price),
  ].join('|');
}

export class NotifierWorker {
  constructor(private readonly deps: NotifierDeps) {}

  async process(alert: AlertJob): Promise<void> {
    const fingerprint = buildFingerprint(alert);

    // Persistent dedup: ask the DB whether we already inserted an alert for
    // this exact (searchId, flightResultId, level) recently. The previous
    // in-memory Set was confused by manual cleanups: deleting rows from the
    // alerts table did not clear the Set, so the same combo would be silently
    // suppressed forever. Querying the DB keeps the dedup state in sync with
    // whatever is actually persisted.
    const dedupTtlMs = this.deps.dedupTtlMs ?? 6 * 60 * 60 * 1000;
    const dedupCutoff = new Date(Date.now() - dedupTtlMs);
    const recent = await this.deps.prisma.alert.findFirst({
      where: {
        searchId: alert.searchId,
        flightResultId: alert.flightResultId,
        level: alert.level,
        sentAt: { gte: dedupCutoff },
      },
      select: { id: true },
    });
    if (recent) {
      return;
    }
    // Keep the in-memory throttle as a secondary cache to avoid hitting the
    // DB for the same job twice in the same process tick.
    if (this.deps.throttle.isFlightDuplicate(fingerprint)) {
      return;
    }

    const search = await this.deps.prisma.search.findUnique({
      where: { id: alert.searchId },
    });

    if (!search) {
      return;
    }

    const searchName = search.name as string;
    const channels = getChannelsForLevel(alert.level);
    const channelsSent: string[] = [];

    // Check if emails are globally paused (30s in-memory cache)
    const emailsPaused = await isEmailsPaused(this.deps.prisma);

    for (const channel of channels) {
      if (!this.deps.throttle.shouldSend(alert.searchId, channel, alert.level)) {
        continue;
      }

      // Skip email channel if globally paused; telegram and websocket still fire
      if (channel === 'email' && emailsPaused) {
        continue;
      }

      try {
        if (channel === 'telegram') {
          const text = formatTelegram(alert, searchName);
          await this.deps.telegram.send(text);
        } else if (channel === 'email') {
          const { subject, html } = formatEmail(alert, searchName);
          await this.deps.email.send(subject, html);
        } else if (channel === 'websocket') {
          const message = formatWebSocket(alert, searchName);
          this.deps.wsBroadcaster.broadcast(message);
        }
        this.deps.throttle.record(alert.searchId, channel);
        channelsSent.push(channel);
      } catch (err) {
        console.error(`  Channel ${channel} failed:`, err instanceof Error ? err.message : err);
      }
    }

    // --- Webhook channel (always evaluated, not part of rules) ---
    try {
      const webhookChannel = await this.resolveWebhookChannel();
      if (webhookChannel) {
        const payload = {
          alert: {
            searchId: alert.searchId,
            flightResultId: alert.flightResultId,
            level: alert.level,
            score: alert.score,
          },
          flightSummary: alert.flightSummary,
          searchName,
        };
        await webhookChannel.send(payload);
        channelsSent.push('webhook');
      }
    } catch (err) {
      console.error('  Channel webhook failed:', err instanceof Error ? err.message : err);
    }

    // --- Slack channel (urgent alerts) ---
    if (alert.level === 'urgent') {
      try {
        const slackChannel = await this.resolveSlackChannel();
        if (slackChannel) {
          const text = formatSlack(alert, searchName);
          await slackChannel.send(text);
          channelsSent.push('slack');
        }
      } catch (err) {
        console.error('  Channel slack failed:', err instanceof Error ? err.message : err);
      }

      // --- Discord channel (urgent alerts) ---
      try {
        const discordChannel = await this.resolveDiscordChannel();
        if (discordChannel) {
          const { content, embeds } = formatDiscord(alert, searchName);
          await discordChannel.send(content, embeds);
          channelsSent.push('discord');
        }
      } catch (err) {
        console.error('  Channel discord failed:', err instanceof Error ? err.message : err);
      }
    }

    this.deps.throttle.recordFlight(fingerprint);

    await this.deps.prisma.alert.create({
      data: {
        searchId: alert.searchId,
        flightResultId: alert.flightResultId,
        level: alert.level,
        channelsSent,
        sentAt: new Date(),
        comboInfo: alert.combo ? (alert.combo as object) : undefined,
      },
    });
  }

  private async resolveWebhookChannel(): Promise<WebhookChannel | null> {
    // deps.webhook = undefined means auto-detect from settings
    // deps.webhook = null means explicitly disabled (for tests)
    if (this.deps.webhook !== undefined) {
      return this.deps.webhook;
    }
    const { url, enabled } = await getWebhookConfig(this.deps.prisma);
    if (!enabled || !url) return null;
    return createWebhookChannel(url);
  }

  private async resolveSlackChannel(): Promise<SlackChannel | null> {
    if (this.deps.slack !== undefined) {
      return this.deps.slack;
    }
    const url = await getSlackWebhookUrl(this.deps.prisma);
    if (!url) return null;
    return createSlackChannel(url);
  }

  private async resolveDiscordChannel(): Promise<DiscordChannel | null> {
    if (this.deps.discord !== undefined) {
      return this.deps.discord;
    }
    const url = await getDiscordWebhookUrl(this.deps.prisma);
    if (!url) return null;
    return createDiscordChannel(url);
  }
}
