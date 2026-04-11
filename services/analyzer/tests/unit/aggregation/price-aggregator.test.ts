import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PriceAggregator } from '../../../src/aggregation/price-aggregator.js';
import type { PrismaClient } from '@flight-hunter/shared/db';

function makePrisma(aggOverrides: any = {}, existing: any = null) {
  return {
    flightResult: {
      aggregate: vi.fn().mockResolvedValue({
        _min: { pricePerPerson: 280, score: 75 },
        _max: { pricePerPerson: 450 },
        _avg: { pricePerPerson: 350 },
        _count: { id: 5 },
        ...aggOverrides,
      }),
    },
    priceHistory: {
      findFirst: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: 'ph-1' }),
      update: vi.fn().mockResolvedValue({ id: 'ph-1' }),
    },
  } as unknown as PrismaClient;
}

describe('PriceAggregator', () => {
  const searchId = 'search-1';
  const date = new Date('2026-04-10T14:00:00Z');

  it('creates a new price_history record when none exists', async () => {
    const prisma = makePrisma({}, null);
    const aggregator = new PriceAggregator(prisma);
    await aggregator.aggregate(searchId, date);

    expect((prisma.priceHistory as any).create).toHaveBeenCalledOnce();
    const data = (prisma.priceHistory as any).create.mock.calls[0][0].data;
    expect(data.searchId).toBe(searchId);
    expect(Number(data.minPrice)).toBe(280);
    expect(Number(data.maxPrice)).toBe(450);
    expect(Number(data.avgPrice)).toBe(350);
    expect(data.sampleCount).toBe(5);
  });

  it('updates existing price_history record when one exists', async () => {
    const existing = { id: 'ph-existing', searchId, date };
    const prisma = makePrisma({}, existing);
    const aggregator = new PriceAggregator(prisma);
    await aggregator.aggregate(searchId, date);

    expect((prisma.priceHistory as any).update).toHaveBeenCalledOnce();
    expect((prisma.priceHistory as any).create).not.toHaveBeenCalled();
  });

  it('does nothing when there are no flight results for the day', async () => {
    const prisma = makePrisma({
      _min: { pricePerPerson: null, score: null },
      _max: { pricePerPerson: null },
      _avg: { pricePerPerson: null },
      _count: { id: 0 },
    }, null);
    const aggregator = new PriceAggregator(prisma);
    await aggregator.aggregate(searchId, date);

    expect((prisma.priceHistory as any).create).not.toHaveBeenCalled();
    expect((prisma.priceHistory as any).update).not.toHaveBeenCalled();
  });

  it('handles null score in aggregate (uses 0)', async () => {
    const prisma = makePrisma({
      _min: { pricePerPerson: 300, score: null },
    }, null);
    const aggregator = new PriceAggregator(prisma);
    await aggregator.aggregate(searchId, date);

    const data = (prisma.priceHistory as any).create.mock.calls[0][0].data;
    expect(data.bestScore).toBe(0);
  });

  it('queries flight results within the correct date window', async () => {
    const prisma = makePrisma({}, null);
    const aggregator = new PriceAggregator(prisma);
    await aggregator.aggregate(searchId, new Date('2026-04-10T20:00:00Z'));

    const where = (prisma.flightResult.aggregate as any).mock.calls[0][0].where;
    expect(where.searchId).toBe(searchId);
    expect(where.suspicious).toBe(false);
    expect(where.scrapedAt.gte).toBeInstanceOf(Date);
    expect(where.scrapedAt.lt).toBeInstanceOf(Date);
  });

  it('only counts non-suspicious results', async () => {
    const prisma = makePrisma({}, null);
    const aggregator = new PriceAggregator(prisma);
    await aggregator.aggregate(searchId, date);

    const where = (prisma.flightResult.aggregate as any).mock.calls[0][0].where;
    expect(where.suspicious).toBe(false);
  });
});
