import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    search: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    purchaseRecord: {
      create: vi.fn(),
    },
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
import { POST as purchasePost } from '../../../src/app/api/searches/[id]/purchase/route';
import { POST as archivePost } from '../../../src/app/api/searches/[id]/archive/route';
import { POST as reactivatePost } from '../../../src/app/api/searches/[id]/reactivate/route';

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });
function makeReq(body: any) {
  return { json: async () => body } as any;
}

describe('POST /api/searches/[id]/purchase', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (prisma.search.findUnique as any).mockResolvedValue({ id: 'search-1', status: 'active' });
    (prisma.purchaseRecord as any).create.mockResolvedValue({ id: 'pr-1', searchId: 'search-1' });
    (prisma.search.update as any).mockResolvedValue({ id: 'search-1', status: 'purchased' });
  });

  it('creates a purchase record and sets status to purchased', async () => {
    const res = await purchasePost(makeReq({ pricePaid: 350, currency: 'USD', bookingUrl: 'https://example.com' }), makeParams('search-1'));
    expect((prisma.purchaseRecord as any).create).toHaveBeenCalledOnce();
    expect((prisma.search.update as any)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'purchased' } }),
    );
    expect(res.status).toBe(200);
    expect(res.data.search.status).toBe('purchased');
  });

  it('works with empty body (all fields optional)', async () => {
    const res = await purchasePost(makeReq({}), makeParams('search-1'));
    expect((prisma.purchaseRecord as any).create).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it('returns 404 when search not found', async () => {
    (prisma.search.findUnique as any).mockResolvedValue(null);
    const res = await purchasePost(makeReq({}), makeParams('missing'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/searches/[id]/archive', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (prisma.search.findUnique as any).mockResolvedValue({ id: 'search-1', status: 'active' });
    (prisma.search.update as any).mockResolvedValue({ id: 'search-1', status: 'archived' });
  });

  it('sets status to archived', async () => {
    const res = await archivePost({} as any, makeParams('search-1'));
    expect((prisma.search.update as any)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'archived' } }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 when search not found', async () => {
    (prisma.search.findUnique as any).mockResolvedValue(null);
    const res = await archivePost({} as any, makeParams('missing'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/searches/[id]/reactivate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (prisma.search.findUnique as any).mockResolvedValue({ id: 'search-1', status: 'snoozed' });
    (prisma.search.update as any).mockResolvedValue({ id: 'search-1', status: 'active', snoozedUntil: null });
  });

  it('reactivates a search and clears snoozedUntil', async () => {
    const res = await reactivatePost({} as any, makeParams('search-1'));
    expect((prisma.search.update as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'active', snoozedUntil: null }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 when search not found', async () => {
    (prisma.search.findUnique as any).mockResolvedValue(null);
    const res = await reactivatePost({} as any, makeParams('missing'));
    expect(res.status).toBe(404);
  });
});
