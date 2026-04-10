import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryService } from '../../../src/detection/history.js';
import type { PrismaClient } from '@flight-hunter/shared';

function makePrismaMock(aggregateResult: {
  _avg: { pricePerPerson: number | null };
  _min: { pricePerPerson: number | null };
}) {
  return {
    flightResult: {
      aggregate: vi.fn().mockResolvedValue(aggregateResult),
    },
  } as unknown as PrismaClient;
}

describe('HistoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns PriceHistory when data exists', async () => {
    const prisma = makePrismaMock({
      _avg: { pricePerPerson: 500 },
      _min: { pricePerPerson: 400 },
    });

    const service = new HistoryService(prisma);
    const result = await service.getPriceHistory('search-1');

    expect(result).not.toBeNull();
    expect(result!.avg48h).toBe(500);
    expect(result!.minHistoric).toBe(400);
  });

  it('returns null when no data exists (avg is null)', async () => {
    const prisma = makePrismaMock({
      _avg: { pricePerPerson: null },
      _min: { pricePerPerson: null },
    });

    const service = new HistoryService(prisma);
    const result = await service.getPriceHistory('search-1');

    expect(result).toBeNull();
  });

  it('returns null when avg is null but min is not', async () => {
    const prisma = makePrismaMock({
      _avg: { pricePerPerson: null },
      _min: { pricePerPerson: 400 },
    });

    const service = new HistoryService(prisma);
    const result = await service.getPriceHistory('search-1');

    expect(result).toBeNull();
  });

  it('returns null when min is null but avg is not', async () => {
    const prisma = makePrismaMock({
      _avg: { pricePerPerson: 500 },
      _min: { pricePerPerson: null },
    });

    const service = new HistoryService(prisma);
    const result = await service.getPriceHistory('search-1');

    expect(result).toBeNull();
  });

  it('queries with correct searchId and 48h window', async () => {
    const prisma = makePrismaMock({
      _avg: { pricePerPerson: 500 },
      _min: { pricePerPerson: 400 },
    });

    const service = new HistoryService(prisma);
    const beforeCall = new Date();
    await service.getPriceHistory('search-xyz');
    const afterCall = new Date();

    expect(prisma.flightResult.aggregate).toHaveBeenCalledOnce();
    const call = vi.mocked(prisma.flightResult.aggregate).mock.calls[0][0];
    expect(call.where?.searchId).toBe('search-xyz');
    expect(call.where?.scrapedAt?.gte).toBeDefined();

    const cutoff = call.where!.scrapedAt!.gte as Date;
    const expectedMin = new Date(beforeCall.getTime() - 48 * 60 * 60 * 1000);
    const expectedMax = new Date(afterCall.getTime() - 48 * 60 * 60 * 1000);
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - 100);
    expect(cutoff.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + 100);
  });

  it('converts Decimal-like values to numbers', async () => {
    // Prisma Decimal can be returned as objects with toNumber()
    const decimalLike = { valueOf: () => 550, toString: () => '550' } as unknown as number;
    const prisma = makePrismaMock({
      _avg: { pricePerPerson: decimalLike },
      _min: { pricePerPerson: 450 },
    });

    const service = new HistoryService(prisma);
    const result = await service.getPriceHistory('search-1');

    expect(result).not.toBeNull();
    expect(typeof result!.avg48h).toBe('number');
  });
});
