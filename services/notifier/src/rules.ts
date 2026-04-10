import type { AlertLevel, NotificationChannel } from '@flight-hunter/shared';

const DEFAULT_CHANNELS: Record<AlertLevel, NotificationChannel[]> = {
  info: ['websocket'],
  good: ['websocket', 'email'],
  urgent: ['websocket', 'email', 'telegram'],
};

export function getChannelsForLevel(
  level: AlertLevel,
  overrides?: NotificationChannel[],
): NotificationChannel[] {
  if (overrides !== undefined) {
    return overrides;
  }
  return DEFAULT_CHANNELS[level];
}
