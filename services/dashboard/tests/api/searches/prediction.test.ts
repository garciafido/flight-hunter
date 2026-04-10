import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    search: { findUnique: vi.fn() },
    priceHistory: { findMany: vi.fn() },
  },
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: any) => ({
      data,
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { prisma } from '@/lib/prisma';
import { GET } from '../../../src/app/api/searches/[id]/prediction/route';

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

function makeHistoryRows(prices: number[]) {
  // Return desc order (as the query would return)
  return [...prices].reverse().map((p, i) => ({
    date: new Date(2026, 0, prices.length - i),
    minPrice: p,
  }));
}

describe('GET /api/searches/[id]/prediction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 404 when search not found', async () => {
    (prisma.search.findUnique as any).mockResolvedValue(null);
    const res = await GET({} as any, makeParams('missing'));
    expect(res.status).toBe(404);
  });

  it('returns null prediction and recommendation when fewer than 3 history rows', async () => {
    (prisma.search.findUnique as any).mockResolvedValue({
      id: 'search-1',
      alertConfig: {},
    });
    (prisma.priceHistory.findMany as any).mockResolvedValue([
      { date: new Date(), minPrice: 500 },
      { date: new Date(), minPrice: 480 },
    ]);

    const res = await GET({} as any, makeParams('search-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.prediction).toBeNull();
    expect(data.recommendation).toBeNull();
  });

  it('returns prediction and recommendation with sufficient history', async () => {
    (prisma.search.findUnique as any).mockResolvedValue({
      id: 'search-1',
      alertConfig: { maxPricePerPerson: 1000 },
    });
    (prisma.priceHistory.findMany as any).mockResolvedValue(
      makeHistoryRows(Array.from({ length: 15 }, (_, i) => 500 - i * 5)),
    );

    const res = await GET({} as any, makeParams('search-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.prediction).not.toBeNull();
    expect(data.recommendation).not.toBeNull();
    expect(data.prediction.confidence).toBe('medium');
    expect(['buy-now', 'wait', 'monitor']).toContain(data.recommendation.action);
  });

  it('uses dreamPricePerPerson from alertConfig for recommendation', async () => {
    // currentMin will be 200 (last price), dreamPrice=300 → buy-now
    (prisma.search.findUnique as any).mockResolvedValue({
      id: 'search-1',
      alertConfig: { dreamPricePerPerson: 300 },
    });
    const prices = [500, 480, 460, 440, 420, 400, 380, 360, 340, 320, 300, 280, 260, 240, 220, 200];
    (prisma.priceHistory.findMany as any).mockResolvedValue(makeHistoryRows(prices));

    const res = await GET({} as any, makeParams('search-1'));
    const data = await res.json();

    expect(data.recommendation.action).toBe('buy-now');
    expect(data.recommendation.reason).toContain('dream');
  });

  it('returns 500 on unexpected error', async () => {
    (prisma.search.findUnique as any).mockRejectedValue(new Error('DB error'));
    const res = await GET({} as any, makeParams('search-1'));
    expect(res.status).toBe(500);
  });

  it('returns high confidence for 30+ history rows', async () => {
    (prisma.search.findUnique as any).mockResolvedValue({
      id: 'search-1',
      alertConfig: {},
    });
    (prisma.priceHistory.findMany as any).mockResolvedValue(
      makeHistoryRows(Array.from({ length: 35 }, (_, i) => 500 - i * 2)),
    );

    const res = await GET({} as any, makeParams('search-1'));
    const data = await res.json();

    expect(data.prediction.confidence).toBe('high');
  });
});
