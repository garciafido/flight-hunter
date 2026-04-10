import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createThrottle } from '../../src/throttle.js';

describe('Throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('shouldSend', () => {
    it('allows sending if no previous record exists', () => {
      const throttle = createThrottle({ cooldownMs: 60_000 });
      expect(throttle.shouldSend('search-1', 'email', 'good')).toBe(true);
    });

    it('always allows sending for urgent level', () => {
      const throttle = createThrottle({ cooldownMs: 60_000 });
      throttle.record('search-1', 'email');
      // advance time by only 1ms (still in cooldown)
      vi.advanceTimersByTime(1);
      expect(throttle.shouldSend('search-1', 'email', 'urgent')).toBe(true);
    });

    it('blocks sending during cooldown for non-urgent levels', () => {
      const throttle = createThrottle({ cooldownMs: 60_000 });
      throttle.record('search-1', 'email');
      vi.advanceTimersByTime(30_000); // halfway through cooldown
      expect(throttle.shouldSend('search-1', 'email', 'good')).toBe(false);
    });

    it('allows sending after cooldown expires', () => {
      const throttle = createThrottle({ cooldownMs: 60_000 });
      throttle.record('search-1', 'email');
      vi.advanceTimersByTime(60_000); // exactly at cooldown
      expect(throttle.shouldSend('search-1', 'email', 'good')).toBe(true);
    });

    it('tracks cooldown per search+channel combination', () => {
      const throttle = createThrottle({ cooldownMs: 60_000 });
      throttle.record('search-1', 'email');
      vi.advanceTimersByTime(10_000);
      // same search different channel
      expect(throttle.shouldSend('search-1', 'websocket', 'good')).toBe(true);
      // different search same channel
      expect(throttle.shouldSend('search-2', 'email', 'good')).toBe(true);
      // same combination still blocked
      expect(throttle.shouldSend('search-1', 'email', 'good')).toBe(false);
    });

    it('blocks info level during cooldown', () => {
      const throttle = createThrottle({ cooldownMs: 60_000 });
      throttle.record('search-1', 'websocket');
      vi.advanceTimersByTime(30_000);
      expect(throttle.shouldSend('search-1', 'websocket', 'info')).toBe(false);
    });
  });

  describe('recordFlight / isFlightDuplicate', () => {
    it('returns false for unseen fingerprint', () => {
      const throttle = createThrottle({ cooldownMs: 60_000 });
      expect(throttle.isFlightDuplicate('fp-abc')).toBe(false);
    });

    it('returns true after recording fingerprint', () => {
      const throttle = createThrottle({ cooldownMs: 60_000 });
      throttle.recordFlight('fp-abc');
      expect(throttle.isFlightDuplicate('fp-abc')).toBe(true);
    });

    it('tracks different fingerprints independently', () => {
      const throttle = createThrottle({ cooldownMs: 60_000 });
      throttle.recordFlight('fp-1');
      expect(throttle.isFlightDuplicate('fp-1')).toBe(true);
      expect(throttle.isFlightDuplicate('fp-2')).toBe(false);
    });
  });
});
