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
import { GET } from '../../../src/app/api/searches/[id]/windows/route';

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/searches/[id]/windows', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 404 when search not found', async () => {
    (prisma.search.findUnique as any).mockResolvedValue(null);
    const res = await GET({} as any, makeParams('missing'));
    expect(res.status).toBe(404);
  });

  it('returns windows grouped by (start, end) dates', async () => {
    (prisma.search.findUnique as any).mockResolvedValue({ id: 'search-1' });
    (prisma.$queryRaw as any).mockResolvedValue([
      {
        window_start: '2026-07-05',
        window_end: '2026-07-19',
        min_price: '380.00',
        result_count: BigInt(5),
        currency: 'USD',
        top_result_id: 'r1',
      },
      {
        window_start: '2026-07-12',
        window_end: '2026-07-26',
        min_price: '360.00',
        result_count: BigInt(3),
        currency: 'USD',
        top_result_id: 'r2',
      },
    ]);

    const res = await GET({} as any, makeParams('search-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.windows).toHaveLength(2);
    expect(data.windows[0]).toMatchObject({
      start: '2026-07-05',
      end: '2026-07-19',
      duration: 14,
      minPrice: 380,
      currency: 'USD',
      resultCount: 5,
      topResultId: 'r1',
    });
  });

  it('computes duration correctly', async () => {
    (prisma.search.findUnique as any).mockResolvedValue({ id: 'search-1' });
    (prisma.$queryRaw as any).mockResolvedValue([
      {
        window_start: '2026-08-01',
        window_end: '2026-08-22',
        min_price: '450.00',
        result_count: BigInt(2),
        currency: 'USD',
        top_result_id: 'r1',
      },
    ]);

    const res = await GET({} as any, makeParams('search-1'));
    const data = await res.json();
    expect(data.windows[0].duration).toBe(21);
  });

  it('returns empty windows array when no results', async () => {
    (prisma.search.findUnique as any).mockResolvedValue({ id: 'search-1' });
    (prisma.$queryRaw as any).mockResolvedValue([]);

    const res = await GET({} as any, makeParams('search-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.windows).toEqual([]);
  });

  it('handles Date objects from query (not strings)', async () => {
    (prisma.search.findUnique as any).mockResolvedValue({ id: 'search-1' });
    (prisma.$queryRaw as any).mockResolvedValue([
      {
        window_start: new Date('2026-07-05'),
        window_end: new Date('2026-07-19'),
        min_price: '380.00',
        result_count: BigInt(4),
        currency: 'USD',
        top_result_id: 'r1',
      },
    ]);

    const res = await GET({} as any, makeParams('search-1'));
    const data = await res.json();

    expect(data.windows[0].start).toBe('2026-07-05');
    expect(data.windows[0].end).toBe('2026-07-19');
  });

  it('returns 500 on unexpected error', async () => {
    (prisma.search.findUnique as any).mockRejectedValue(new Error('DB error'));
    const res = await GET({} as any, makeParams('search-1'));
    expect(res.status).toBe(500);
  });
});
