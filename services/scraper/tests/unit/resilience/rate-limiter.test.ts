import { describe, it, expect, vi, afterEach } from 'vitest';
import { RateLimiter } from '../../../src/resilience/rate-limiter.js';

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests when tokens are available', async () => {
    const limiter = new RateLimiter(5, 60_000);
    // Should complete immediately without waiting
    const start = Date.now();
    await limiter.waitForToken('source-a');
    await limiter.waitForToken('source-a');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('tracks tokens per key independently', async () => {
    const limiter = new RateLimiter(2, 60_000);
    await limiter.waitForToken('source-a');
    await limiter.waitForToken('source-a');
    expect(limiter.getTokens('source-a')).toBe(0);
    // source-b still has full capacity
    expect(limiter.getTokens('source-b')).toBe(2);
  });

  it('initializes with full capacity for new keys', () => {
    const limiter = new RateLimiter(10, 60_000);
    expect(limiter.getTokens('new-key')).toBe(10);
  });

  it('waits when tokens are exhausted', async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(1, 1000);

    // Consume the only token
    await limiter.waitForToken('key');
    expect(limiter.getTokens('key')).toBe(0);

    // Start waiting for next token (should wait ~1000ms)
    const waitPromise = limiter.waitForToken('key');
    // Advance timer so token refills
    vi.advanceTimersByTime(1100);
    await waitPromise;
    // After consuming, tokens should be 0 again
    expect(limiter.getTokens('key')).toBe(0);
  });

  it('refills tokens over time', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(10, 1000);
    // Consume all tokens
    for (let i = 0; i < 10; i++) {
      limiter['buckets'].set('k', { tokens: 0, lastRefill: Date.now() });
    }
    // Advance time by 500ms → should have 5 tokens (half the window)
    vi.advanceTimersByTime(500);
    expect(limiter.getTokens('k')).toBe(5);
  });
});
