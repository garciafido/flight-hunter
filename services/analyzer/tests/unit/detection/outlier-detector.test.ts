import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutlierDetector } from '../../../src/detection/outlier-detector.js';
import type { PrismaClient } from '@flight-hunter/shared/db';

function makePrisma(recentRows: Array<{ pricePerPerson: number; source: string }> = []) {
  return {
    flightResult: {
      findMany: vi.fn().mockResolvedValue(recentRows),
    },
  } as unknown as PrismaClient;
}

describe('OutlierDetector', () => {
  let detector: OutlierDetector;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not suspicious for normal price (no history, no cross-source)', async () => {
    const prisma = makePrisma([]);
    detector = new OutlierDetector(prisma);
    const result = await detector.check('search-1', 500, 'kiwi', null);
    expect(result.suspicious).toBe(false);
  });

  it('flags price too low vs historical avg (< 30% of avg)', async () => {
    const prisma = makePrisma([]);
    detector = new OutlierDetector(prisma);
    // avg48h = 500, price = 100 (20% of avg) → suspicious
    const result = await detector.check('search-1', 100, 'kiwi', 500);
    expect(result.suspicious).toBe(true);
    expect(result.suspicionReason).toBe('price too low vs historical avg');
  });

  it('does not flag price at exactly 30% of avg', async () => {
    const prisma = makePrisma([]);
    detector = new OutlierDetector(prisma);
    // avg48h = 500, price = 150 (30% exactly) → not suspicious
    const result = await detector.check('search-1', 150, 'kiwi', 500);
    expect(result.suspicious).toBe(false);
  });

  it('does not flag price above 30% of avg', async () => {
    const prisma = makePrisma([]);
    detector = new OutlierDetector(prisma);
    // avg48h = 500, price = 200 (40%) → not suspicious
    const result = await detector.check('search-1', 200, 'kiwi', 500);
    expect(result.suspicious).toBe(false);
  });

  it('flags cross-source outlier when price < 50% of median from 2+ sources', async () => {
    const prisma = makePrisma([
      { pricePerPerson: 400, source: 'amadeus' },
      { pricePerPerson: 600, source: 'travelpayouts' },
    ]);
    detector = new OutlierDetector(prisma);
    // median = 500, price = 200 (40% of median) → suspicious
    const result = await detector.check('search-1', 200, 'kiwi', null);
    expect(result.suspicious).toBe(true);
    expect(result.suspicionReason).toBe('price too low vs other sources');
  });

  it('does not flag cross-source when only 1 other source exists', async () => {
    // Only 1 source → need at least 2
    const prisma = makePrisma([
      { pricePerPerson: 400, source: 'amadeus' },
      { pricePerPerson: 450, source: 'amadeus' }, // same source, still 1 distinct source
    ]);
    detector = new OutlierDetector(prisma);
    const result = await detector.check('search-1', 100, 'kiwi', null);
    expect(result.suspicious).toBe(false);
  });

  it('does not flag cross-source when price is >= 50% of median', async () => {
    const prisma = makePrisma([
      { pricePerPerson: 400, source: 'amadeus' },
      { pricePerPerson: 600, source: 'travelpayouts' },
    ]);
    detector = new OutlierDetector(prisma);
    // median = 500, price = 300 (60%) → ok
    const result = await detector.check('search-1', 300, 'kiwi', null);
    expect(result.suspicious).toBe(false);
  });

  it('historical check takes priority over cross-source', async () => {
    // Both conditions met, but historical fires first
    const prisma = makePrisma([
      { pricePerPerson: 400, source: 'amadeus' },
      { pricePerPerson: 600, source: 'travelpayouts' },
    ]);
    detector = new OutlierDetector(prisma);
    // avg48h = 500, price = 50 → both historical and cross-source would flag
    const result = await detector.check('search-1', 50, 'kiwi', 500);
    expect(result.suspicious).toBe(true);
    expect(result.suspicionReason).toBe('price too low vs historical avg');
  });

  it('does not flag when avg48h is 0', async () => {
    const prisma = makePrisma([]);
    detector = new OutlierDetector(prisma);
    const result = await detector.check('search-1', 1, 'kiwi', 0);
    expect(result.suspicious).toBe(false);
  });
});
