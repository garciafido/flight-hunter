import type { AlertLevel, NotificationChannel } from '@flight-hunter/shared';

export interface ThrottleOptions {
  cooldownMs: number;
  /**
   * How long a previously-seen flight fingerprint stays "deduped".
   * After this many milliseconds the same fingerprint can fire a new alert.
   * Defaults to 6 hours to avoid spamming the same combo on every scan
   * while still re-alerting after a meaningful gap.
   */
  flightDedupTtlMs?: number;
}

export interface Throttle {
  shouldSend(searchId: string, channel: NotificationChannel, level: AlertLevel): boolean;
  record(searchId: string, channel: NotificationChannel): void;
  recordFlight(fingerprint: string): void;
  isFlightDuplicate(fingerprint: string): boolean;
}

export function createThrottle(options: ThrottleOptions): Throttle {
  const lastSent = new Map<string, number>();
  const seenFlights = new Map<string, number>(); // fingerprint -> recordedAt
  const flightDedupTtlMs = options.flightDedupTtlMs ?? 6 * 60 * 60 * 1000;

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
      seenFlights.set(fingerprint, Date.now());
    },

    isFlightDuplicate(fingerprint: string): boolean {
      const seenAt = seenFlights.get(fingerprint);
      if (seenAt === undefined) return false;
      if (Date.now() - seenAt >= flightDedupTtlMs) {
        // Stale entry — purge and treat as new
        seenFlights.delete(fingerprint);
        return false;
      }
      return true;
    },
  };
}
