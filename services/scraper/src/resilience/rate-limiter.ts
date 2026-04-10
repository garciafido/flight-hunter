export class RateLimiter {
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();

  constructor(
    private readonly capacity: number = 30,
    private readonly windowMs: number = 60 * 1000,
  ) {}

  async waitForToken(key: string): Promise<void> {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, lastRefill: now };
    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor((elapsed / this.windowMs) * this.capacity);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + refill);
    bucket.lastRefill = now;

    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      this.buckets.set(key, bucket);
      return;
    }

    // Wait until next token
    const waitMs = Math.ceil(this.windowMs / this.capacity);
    await new Promise<void>((r) => setTimeout(r, waitMs));
    return this.waitForToken(key);
  }

  /** Returns available tokens without consuming one (for testing). */
  getTokens(key: string): number {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket) return this.capacity;
    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor((elapsed / this.windowMs) * this.capacity);
    return Math.min(this.capacity, bucket.tokens + refill);
  }
}
