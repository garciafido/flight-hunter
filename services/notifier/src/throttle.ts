import type { AlertLevel, NotificationChannel } from '@flight-hunter/shared';

export interface ThrottleOptions {
  cooldownMs: number;
}

export interface Throttle {
  shouldSend(searchId: string, channel: NotificationChannel, level: AlertLevel): boolean;
  record(searchId: string, channel: NotificationChannel): void;
  recordFlight(fingerprint: string): void;
  isFlightDuplicate(fingerprint: string): boolean;
}

export function createThrottle(options: ThrottleOptions): Throttle {
  const lastSent = new Map<string, number>();
  const seenFlights = new Set<string>();

  function makeKey(searchId: string, channel: NotificationChannel): string {
    return `${searchId}:${channel}`;
  }

  return {
    shouldSend(searchId: string, channel: NotificationChannel, level: AlertLevel): boolean {
      if (level === 'urgent') {
        return true;
      }
      const key = makeKey(searchId, channel);
      const last = lastSent.get(key);
      if (last === undefined) {
        return true;
      }
      return Date.now() - last >= options.cooldownMs;
    },

    record(searchId: string, channel: NotificationChannel): void {
      const key = makeKey(searchId, channel);
      lastSent.set(key, Date.now());
    },

    recordFlight(fingerprint: string): void {
      seenFlights.add(fingerprint);
    },

    isFlightDuplicate(fingerprint: string): boolean {
      return seenFlights.has(fingerprint);
    },
  };
}
