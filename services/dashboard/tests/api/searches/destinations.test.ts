import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    search: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
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

vi.mock('@flight-hunter/shared', () => ({
  Prisma: { sql: (strings: TemplateStringsArray, ...values: any[]) => ({ strings, values }) },
}));

import { prisma } from '@/lib/prisma';
import { GET } from '../../../src/app/api/searches/[id]/destinations/route';

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/searches/[id]/destinations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 404 when search not found', async () => {
    (prisma.search.findUnique as any).mockResolvedValue(null);
    const res = await GET({} as any, makeParams('missing'));
    expect(res.status).toBe(404);
  });

  it('returns destinations grouped by arrival airport', async () => {
    (prisma.search.findUnique as any).mockResolvedValue({ id: 'search-1' });
    (prisma.$queryRaw as any).mockResolvedValue([
      { iata: 'CUZ', min_price: '285.00', result_count: BigInt(12), currency: 'USD', top_result_id: 'r1' },
      { iata: 'LIM', min_price: '310.50', result_count: BigInt(18), currency: 'USD', top_result_id: 'r2' },
    ]);

    const res = await GET({} as any, makeParams('search-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.destinations).toHaveLength(2);
    expect(data.destinations[0]).toMatchObject({
      iata: 'CUZ',
      minPrice: 285,
      currency: 'USD',
      resultCount: 12,
      topResultId: 'r1',
    });
  });

  it('returns empty destinations array when no results', async () => {
    (prisma.search.findUnique as any).mockResolvedValue({ id: 'search-1' });
    (prisma.$queryRaw as any).mockResolvedValue([]);

    const res = await GET({} as any, makeParams('search-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.destinations).toEqual([]);
  });

  it('returns 500 on unexpected error', async () => {
    (prisma.search.findUnique as any).mockRejectedValue(new Error('DB error'));
    const res = await GET({} as any, makeParams('search-1'));
    expect(res.status).toBe(500);
  });
});
