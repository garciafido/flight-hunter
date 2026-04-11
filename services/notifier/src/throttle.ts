import type { AlertLevel, NotificationChannel } from '@flight-hunter/shared';

/**
 * Throttle options. Both timing values are functions so the runtime config
 * loader can change them on the fly without reconstructing the throttle.
 */
export interface ThrottleOptions {
  cooldownMs: number | (() => number);
  /**
   * How long a previously-seen flight fingerprint stays "deduped".
   * After this many milliseconds the same fingerprint can fire a new alert.
   */
  flightDedupTtlMs?: number | (() => number);
}

export interface Throttle {
  shouldSend(searchId: string, channel: NotificationChannel, level: AlertLevel): boolean;
  record(searchId: string, channel: NotificationChannel): void;
  recordFlight(fingerprint: string): void;
  isFlightDuplicate(fingerprint: string): boolean;
}

function asGetter(value: number | (() => number) | undefined, fallback: number): () => number {
  if (typeof value === 'function') return value;
  if (typeof value === 'number') return () => value;
  return () => fallback;
}

export function createThrottle(options: ThrottleOptions): Throttle {
  const lastSent = new Map<string, number>();
  const seenFlights = new Map<string, number>(); // fingerprint -> recordedAt
  const getCooldownMs = asGetter(options.cooldownMs, 2 * 60 * 60 * 1000);
  const getFlightDedupTtlMs = asGetter(options.flightDedupTtlMs, 6 * 60 * 60 * 1000);

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
      return Date.now() - last >= getCooldownMs();
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
      if (Date.now() - seenAt >= getFlightDedupTtlMs()) {
        // Stale entry — purge and treat as new
        seenFlights.delete(fingerprint);
        return false;
      }
      return true;
    },
  };
}
