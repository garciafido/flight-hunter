import type { PrismaClient } from '@flight-hunter/shared/db';
import { CircuitBreaker } from './circuit-breaker.js';
import { RateLimiter } from './rate-limiter.js';
import { SourceMetricsService } from './source-metrics.js';

/**
 * Per-source rate-limit configuration (requests per minute).
 */
const SOURCE_RATE_LIMITS: Record<string, number> = {
  'google-flights': 10,
};
const DEFAULT_RATE_LIMIT = 10;

export interface ResilienceLayer {
  /**
   * Wrap a source call with rate limiting, circuit breaker, and metrics.
   * Returns the result array, or null if the circuit was open (skipped).
   */
  callSource<T>(
    sourceName: string,
    hasApiKey: boolean,
    fn: () => Promise<T>,
  ): Promise<{ result: T | null; skipped: boolean }>;
}

export class DefaultResilienceLayer implements ResilienceLayer {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: RateLimiter;
  private readonly metricsService: SourceMetricsService;
  private readonly circuitCooldownMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    circuitThreshold = 5,
    circuitCooldownMs = 5 * 60_000,
  ) {
    this.circuitCooldownMs = circuitCooldownMs;
    this.circuitBreaker = new CircuitBreaker(circuitThreshold, circuitCooldownMs);
    // RateLimiter capacity / windowMs are per-source, but the class only takes a single
    // pair. We create a single instance with default 60/min and override per-key via
    // a thin wrapper that creates per-source limiters on demand.
    this.rateLimiter = new RateLimiter(DEFAULT_RATE_LIMIT, 60_000);
    this.metricsService = new SourceMetricsService(prisma);
  }

  async callSource<T>(
    sourceName: string,
    hasApiKey: boolean,
    fn: () => Promise<T>,
  ): Promise<{ result: T | null; skipped: boolean }> {
    // 1. Resolve source row and current circuit state from DB
    const { id: sourceId, circuitState } = await this.metricsService.ensureSource(
      sourceName,
      hasApiKey,
    );

    // 2. Fast-path: if open and cooldown NOT elapsed, skip without touching rate limiter
    if (circuitState.status === 'open') {
      const elapsed = Date.now() - (circuitState.openedAt?.getTime() ?? 0);
      if (elapsed < this.circuitCooldownMs) {
        console.log(`Source ${sourceName} skipped — circuit open`);
        return { result: null, skipped: true };
      }
      // Cooldown elapsed → let circuit breaker transition to half-open (falls through below)
    }

    // 3. Acquire rate-limit token
    const capacity = SOURCE_RATE_LIMITS[sourceName] ?? DEFAULT_RATE_LIMIT;
    await this.getOrCreateRateLimiter(sourceName, capacity).waitForToken(sourceName);

    // 4. Execute with circuit breaker
    const start = Date.now();
    const { result, newState, skipped } = await this.circuitBreaker.execute(
      sourceName,
      circuitState,
      fn,
    );
    const durationMs = Date.now() - start;
    const success = result !== null && !skipped;
    const errorType = (!success && !skipped) ? 'source_error' : undefined;

    // 5. Persist metrics
    await this.metricsService.recordMetric({
      sourceId,
      success,
      resultCount: Array.isArray(result) ? result.length : (result !== null ? 1 : 0),
      durationMs,
      errorType,
      newCircuitState: newState,
    });

    return { result, skipped };
  }

  private rateLimiters = new Map<string, RateLimiter>();

  private getOrCreateRateLimiter(sourceName: string, capacity: number): RateLimiter {
    if (!this.rateLimiters.has(sourceName)) {
      this.rateLimiters.set(sourceName, new RateLimiter(capacity, 60_000));
    }
    return this.rateLimiters.get(sourceName)!;
  }
}

/**
 * No-op resilience layer for use in tests.
 * Passes through to the function with no rate limiting, circuit breaking, or metrics.
 */
export class PassthroughResilienceLayer implements ResilienceLayer {
  async callSource<T>(
    _sourceName: string,
    _hasApiKey: boolean,
    fn: () => Promise<T>,
  ): Promise<{ result: T | null; skipped: boolean }> {
    try {
      const result = await fn();
      return { result, skipped: false };
    } catch {
      return { result: null, skipped: false };
    }
  }
}
