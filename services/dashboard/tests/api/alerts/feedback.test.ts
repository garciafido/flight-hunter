import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alert: {
      findUnique: vi.fn(),
      update: vi.fn(),
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
import { POST } from '../../../src/app/api/alerts/[id]/feedback/route';

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });
const makeReq = (body: any) => ({ json: async () => body } as any);

describe('POST /api/alerts/[id]/feedback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (prisma.alert.findUnique as any).mockResolvedValue({ id: 'alert-1', level: 'urgent' });
    (prisma.alert.update as any).mockResolvedValue({
      id: 'alert-1',
      feedback: 'positive',
      feedbackAt: new Date('2026-04-08T10:00:00Z'),
    });
  });

  it('accepts positive feedback', async () => {
    const res = await POST(makeReq({ value: 'positive' }), makeParams('alert-1'));
    expect(res.status).toBe(200);
    expect((prisma.alert.update as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'alert-1' },
        data: expect.objectContaining({ feedback: 'positive' }),
      }),
    );
  });

  it('accepts negative feedback', async () => {
    (prisma.alert.update as any).mockResolvedValue({
      id: 'alert-1',
      feedback: 'negative',
      feedbackAt: new Date(),
    });
    const res = await POST(makeReq({ value: 'negative' }), makeParams('alert-1'));
    expect(res.status).toBe(200);
    expect((prisma.alert.update as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ feedback: 'negative' }),
      }),
    );
  });

  it('returns 400 for invalid feedback value', async () => {
    const res = await POST(makeReq({ value: 'neutral' }), makeParams('alert-1'));
    expect(res.status).toBe(400);
    expect((prisma.alert.update as any)).not.toHaveBeenCalled();
  });

  it('returns 400 when value is missing', async () => {
    const res = await POST(makeReq({}), makeParams('alert-1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when alert not found', async () => {
    (prisma.alert.findUnique as any).mockResolvedValue(null);
    const res = await POST(makeReq({ value: 'positive' }), makeParams('missing'));
    expect(res.status).toBe(404);
  });

  it('returns feedbackAt in response', async () => {
    const res = await POST(makeReq({ value: 'positive' }), makeParams('alert-1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.feedbackAt).toBeDefined();
  });

  it('sets feedbackAt to a Date when updating', async () => {
    await POST(makeReq({ value: 'positive' }), makeParams('alert-1'));
    const callData = (prisma.alert.update as any).mock.calls[0][0].data;
    expect(callData.feedbackAt).toBeInstanceOf(Date);
  });
});
