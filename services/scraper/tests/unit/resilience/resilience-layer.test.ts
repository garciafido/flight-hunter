import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultResilienceLayer, PassthroughResilienceLayer } from '../../../src/resilience/resilience-layer.js';

function makeMockPrisma(initial: { circuitState?: string; circuitOpenedAt?: Date | null; consecutiveFailures?: number } = {}) {
  return {
    source: {
      upsert: vi.fn().mockResolvedValue({
        id: 'src-1',
        circuitState: initial.circuitState ?? 'closed',
        consecutiveFailures: initial.consecutiveFailures ?? 0,
        circuitOpenedAt: initial.circuitOpenedAt ?? null,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    sourceMetric: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('PassthroughResilienceLayer', () => {
  it('passes result through on success', async () => {
    const layer = new PassthroughResilienceLayer();
    const result = await layer.callSource('test', false, async () => [1, 2, 3]);
    expect(result.result).toEqual([1, 2, 3]);
    expect(result.skipped).toBe(false);
  });

  it('returns null on error without throwing', async () => {
    const layer = new PassthroughResilienceLayer();
    const result = await layer.callSource('test', false, async () => { throw new Error('boom'); });
    expect(result.result).toBeNull();
    expect(result.skipped).toBe(false);
  });
});

describe('DefaultResilienceLayer', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    prisma = makeMockPrisma();
  });

  it('executes function on closed circuit and records success metric', async () => {
    const layer = new DefaultResilienceLayer(prisma as never);
    const result = await layer.callSource('google-flights', false, async () => [1, 2]);

    expect(result.result).toEqual([1, 2]);
    expect(result.skipped).toBe(false);
    expect(prisma.sourceMetric.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceId: 'src-1',
        success: true,
        resultCount: 2,
        errorType: null,
      }),
    });
    expect(prisma.source.update).toHaveBeenCalled();
  });

  it('records failure metric and source_error type when fn throws', async () => {
    const layer = new DefaultResilienceLayer(prisma as never);
    const result = await layer.callSource('google-flights', false, async () => { throw new Error('fail'); });

    expect(result.result).toBeNull();
    expect(result.skipped).toBe(false);
    expect(prisma.sourceMetric.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        success: false,
        resultCount: 0,
        errorType: 'source_error',
      }),
    });
  });

  it('skips fn when circuit is open and cooldown not elapsed', async () => {
    prisma = makeMockPrisma({
      circuitState: 'open',
      circuitOpenedAt: new Date(Date.now() - 1000), // 1s ago, well within 5min default
      consecutiveFailures: 5,
    });
    const layer = new DefaultResilienceLayer(prisma as never);
    const fn = vi.fn().mockResolvedValue(['x']);

    const result = await layer.callSource('google-flights', false, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(result.result).toBeNull();
    expect(result.skipped).toBe(true);
    expect(prisma.sourceMetric.create).not.toHaveBeenCalled();
  });

  it('lets fn run when circuit is open but cooldown elapsed (half-open)', async () => {
    prisma = makeMockPrisma({
      circuitState: 'open',
      circuitOpenedAt: new Date(Date.now() - 6 * 60_000), // 6 min ago, beyond 5min cooldown
      consecutiveFailures: 5,
    });
    const layer = new DefaultResilienceLayer(prisma as never);
    const fn = vi.fn().mockResolvedValue([1]);

    const result = await layer.callSource('google-flights', false, fn);

    expect(fn).toHaveBeenCalled();
    expect(result.result).toEqual([1]);
  });

  it('uses per-source rate limit (creates separate limiter per source name)', async () => {
    const layer = new DefaultResilienceLayer(prisma as never);
    // Two different source names should each get their own limiter
    await layer.callSource('google-flights', false, async () => [1]);
    await layer.callSource('unknown-source', false, async () => [2]);

    // Both should have executed
    expect(prisma.sourceMetric.create).toHaveBeenCalledTimes(2);
  });

  it('reuses rate limiter across calls to same source', async () => {
    const layer = new DefaultResilienceLayer(prisma as never);
    await layer.callSource('google-flights', false, async () => [1]);
    await layer.callSource('google-flights', false, async () => [2]);

    expect(prisma.sourceMetric.create).toHaveBeenCalledTimes(2);
  });

  it('handles non-array result by counting as 1', async () => {
    const layer = new DefaultResilienceLayer(prisma as never);
    const result = await layer.callSource('google-flights', false, async () => ({ value: 42 }));

    expect(result.result).toEqual({ value: 42 });
    expect(prisma.sourceMetric.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resultCount: 1,
      }),
    });
  });

  it('uses default rate limit for unknown source', async () => {
    const layer = new DefaultResilienceLayer(prisma as never);
    const result = await layer.callSource('unknown-source', false, async () => [1]);
    expect(result.result).toEqual([1]);
  });
});
