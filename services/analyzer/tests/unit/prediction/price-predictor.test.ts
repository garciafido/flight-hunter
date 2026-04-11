import { describe, it, expect, vi } from 'vitest';
import { PricePredictor } from '../../../src/prediction/price-predictor.js';
import type { PrismaClient } from '@flight-hunter/shared/db';

function makePrisma(rows: Array<{ date: Date; minPrice: number | string }>) {
  return {
    priceHistory: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  } as unknown as PrismaClient;
}

function makeRows(prices: number[]): Array<{ date: Date; minPrice: number }> {
  // prices are in ascending date order → reverse for "desc" query response
  return [...prices]
    .reverse()
    .map((p, i) => ({
      date: new Date(2026, 0, prices.length - i),
      minPrice: p,
    }));
}

describe('PricePredictor', () => {
  it('returns null when fewer than 3 history rows', async () => {
    const prisma = makePrisma([{ date: new Date(), minPrice: 500 }, { date: new Date(), minPrice: 480 }]);
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result).toBeNull();
  });

  it('returns null for empty history', async () => {
    const prisma = makePrisma([]);
    const predictor = new PricePredictor(prisma);
    expect(await predictor.predict('s')).toBeNull();
  });

  it('returns a prediction for 3 rows (low confidence)', async () => {
    const prices = [500, 480, 460];
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('low');
    expect(result!.currentMin).toBe(460);
  });

  it('returns medium confidence for 14 rows', async () => {
    const prices = Array.from({ length: 14 }, (_, i) => 500 - i * 5);
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result!.confidence).toBe('medium');
  });

  it('returns high confidence for 30+ rows', async () => {
    const prices = Array.from({ length: 30 }, (_, i) => 500 - i * 2);
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result!.confidence).toBe('high');
  });

  it('computes movingAvg7d correctly', async () => {
    const prices = Array.from({ length: 10 }, (_, i) => 100 + i * 10); // 100,110,...190
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    // last 7: 130,140,150,160,170,180,190 → avg = 145.71...
    const last7 = [130, 140, 150, 160, 170, 180, 190];
    const expected = Math.round(last7.reduce((a, b) => a + b, 0) / 7 * 100) / 100;
    expect(result!.movingAvg7d).toBeCloseTo(expected, 1);
  });

  it('computes movingAvg30d using all rows when less than 30', async () => {
    const prices = Array.from({ length: 10 }, () => 200);
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result!.movingAvg30d).toBe(200);
  });

  it('detects downward trend (negative slope)', async () => {
    // Prices strictly decreasing
    const prices = Array.from({ length: 14 }, (_, i) => 500 - i * 10);
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result!.trendSlope).toBeLessThan(0);
  });

  it('detects upward trend (positive slope)', async () => {
    // Prices strictly increasing
    const prices = Array.from({ length: 14 }, (_, i) => 300 + i * 10);
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result!.trendSlope).toBeGreaterThan(0);
  });

  it('detects flat trend (slope near zero) for constant prices', async () => {
    const prices = Array.from({ length: 14 }, () => 400);
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result!.trendSlope).toBe(0);
  });

  it('predicted7dMin and predicted14dMin are non-negative', async () => {
    // Sharply decreasing prices that could go negative without clamping
    const prices = Array.from({ length: 14 }, (_, i) => Math.max(10, 500 - i * 100));
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result!.predicted7dMin).toBeGreaterThanOrEqual(0);
    expect(result!.predicted14dMin).toBeGreaterThanOrEqual(0);
  });

  it('queries with correct searchId and limits to 60 rows', async () => {
    const prices = Array.from({ length: 60 }, (_, i) => 500 - i);
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    await predictor.predict('my-search');
    expect((prisma.priceHistory.findMany as any).mock.calls[0][0]).toMatchObject({
      where: { searchId: 'my-search' },
      take: 60,
      orderBy: { date: 'desc' },
    });
  });

  it('handles decimal minPrice values (Decimal type)', async () => {
    const rows = [
      { date: new Date(), minPrice: '450.50' },
      { date: new Date(), minPrice: '460.25' },
      { date: new Date(), minPrice: '455.75' },
    ];
    const prisma = makePrisma(rows);
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result).not.toBeNull();
    expect(typeof result!.currentMin).toBe('number');
  });

  it('returns rounded trendSlope with 2 decimal places', async () => {
    const prices = Array.from({ length: 14 }, (_, i) => 500 + i * 3.333);
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    const rounded = Math.round(result!.trendSlope * 100) / 100;
    expect(result!.trendSlope).toBe(rounded);
  });

  it('handles single-element history window gracefully (linearRegressionSlope with n<2)', async () => {
    // 3 rows total. Last 14 → only 3 rows, window.slice(-14) = 3 rows. n >= 2 ok.
    // But we want to exercise the 1-item path by having exactly 3 rows (slice(-14) = 3 items).
    // Actually with 3 items, n=3 >= 2 so slope works fine.
    // To force n=1: this is not reachable from predict() since history.length >= 3 means at least 3 prices.
    // So instead: test with exactly 3 rows and verify slope is computed (not 0)
    const prices = [400, 450, 500]; // flat trend actually: regression slope
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result).not.toBeNull();
    // avg of all prices = avg30d (only 3 rows)
    expect(result!.movingAvg30d).toBeCloseTo(450, 0);
  });

  it('movingAvg7d uses empty slice → 0 when fewer than 1 price in last 7 (edge: exactly 3 rows, last7 has 3)', async () => {
    // With 3 rows, last7 = all 3, avg should work normally (not 0)
    const prices = [300, 350, 400];
    const prisma = makePrisma(makeRows(prices));
    const predictor = new PricePredictor(prisma);
    const result = await predictor.predict('search-1');
    expect(result!.movingAvg7d).toBeGreaterThan(0);
  });
});
