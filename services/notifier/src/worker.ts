import type { PrismaClient } from '@flight-hunter/shared';
import type { AlertJob } from '@flight-hunter/shared';
import type { TelegramChannel } from './channels/telegram.js';
import type { EmailChannel } from './channels/email.js';
import type { WebSocketBroadcaster } from './channels/websocket.js';
import type { Throttle } from './throttle.js';
import { formatTelegram } from './formatter/telegram-fmt.js';
import { formatEmail } from './formatter/email-fmt.js';
import { formatWebSocket } from './formatter/ws-fmt.js';
import { getChannelsForLevel } from './rules.js';

export interface NotifierDeps {
  telegram: TelegramChannel;
  email: EmailChannel;
  wsBroadcaster: WebSocketBroadcaster;
  throttle: Throttle;
  prisma: PrismaClient;
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

    for (const channel of channels) {
      if (!this.deps.throttle.shouldSend(alert.searchId, channel, alert.level)) {
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

    this.deps.throttle.recordFlight(fingerprint);

    await this.deps.prisma.alert.create({
      data: {
        searchId: alert.searchId,
        flightResultId: alert.flightResultId,
        level: alert.level,
        channelsSent,
        sentAt: new Date(),
      },
    });
  }
}
