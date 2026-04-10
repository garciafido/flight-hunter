import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    search: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock NextResponse
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
import { POST as snoozePost } from '../../../src/app/api/searches/[id]/snooze/route';
import { POST as unsnoozePost } from '../../../src/app/api/searches/[id]/unsnooze/route';

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

function makeReq(body: any) {
  return { json: async () => body } as any;
}

describe('POST /api/searches/[id]/snooze', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (prisma.search.findUnique as any).mockResolvedValue({ id: 'search-1', status: 'active' });
    (prisma.search.update as any).mockResolvedValue({ id: 'search-1', status: 'snoozed' });
  });

  it('snoozes for 1day preset', async () => {
    const res = await snoozePost(makeReq({ until: '1day' }), makeParams('search-1'));
    expect((prisma.search.update as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'snoozed' }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('snoozes for 1week preset', async () => {
    const res = await snoozePost(makeReq({ until: '1week' }), makeParams('search-1'));
    expect((prisma.search.update as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'snoozed' }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('snoozes indefinitely (null snoozedUntil)', async () => {
    const res = await snoozePost(makeReq({ until: 'indefinite' }), makeParams('search-1'));
    expect((prisma.search.update as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'snoozed', snoozedUntil: null }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('snoozes with explicit date', async () => {
    const res = await snoozePost(makeReq({ until: '2026-05-01' }), makeParams('search-1'));
    const callData = (prisma.search.update as any).mock.calls[0][0].data;
    expect(callData.status).toBe('snoozed');
    expect(callData.snoozedUntil).toBeInstanceOf(Date);
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid date', async () => {
    const res = await snoozePost(makeReq({ until: 'not-a-date' }), makeParams('search-1'));
    expect(res.status).toBe(400);
    expect((prisma.search.update as any)).not.toHaveBeenCalled();
  });

  it('returns 400 when until is missing', async () => {
    const res = await snoozePost(makeReq({}), makeParams('search-1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when search not found', async () => {
    (prisma.search.findUnique as any).mockResolvedValue(null);
    const res = await snoozePost(makeReq({ until: '1day' }), makeParams('missing'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/searches/[id]/unsnooze', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (prisma.search.findUnique as any).mockResolvedValue({ id: 'search-1', status: 'snoozed' });
    (prisma.search.update as any).mockResolvedValue({ id: 'search-1', status: 'active', snoozedUntil: null });
  });

  it('unsnoozes a search', async () => {
    const res = await unsnoozePost({} as any, makeParams('search-1'));
    expect((prisma.search.update as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'active', snoozedUntil: null }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 when search not found', async () => {
    (prisma.search.findUnique as any).mockResolvedValue(null);
    const res = await unsnoozePost({} as any, makeParams('missing'));
    expect(res.status).toBe(404);
  });
});
