import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DailyDigest } from '../../../src/digest/daily-digest.js';
import type { PrismaClient } from '@flight-hunter/shared';
import type { EmailChannel } from '../../../src/channels/email.js';

function makeResult(overrides: any = {}) {
  return {
    id: 'r1',
    pricePerPerson: 300,
    currency: 'USD',
    bookingUrl: 'https://example.com',
    outbound: { airline: 'LATAM', departure: { time: '2026-07-25T10:00:00Z' } },
    inbound: { arrival: { time: '2026-08-09T15:00:00Z' } },
    ...overrides,
  };
}

function makeSearch(overrides: any = {}) {
  return {
    id: 'search-1',
    name: 'Test',
    origin: 'GRU',
    destination: 'MAD',
    status: 'active',
    digestEnabled: true,
    digestFrequency: 'daily',
    lastDigestSentAt: null,
    flightResults: [makeResult(), makeResult({ id: 'r2', pricePerPerson: 350 })],
    ...overrides,
  };
}

function makePrisma(searches: any[] = [makeSearch()]) {
  return {
    search: {
      findMany: vi.fn().mockResolvedValue(searches),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    flightResult: {
      aggregate: vi.fn().mockResolvedValue({ _min: { pricePerPerson: null } }),
    },
  } as unknown as PrismaClient;
}

function makeEmail(): EmailChannel {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe('DailyDigest', () => {
  let email: EmailChannel;

  beforeEach(() => {
    email = makeEmail();
  });

  it('sends a digest email when there are active searches with results', async () => {
    const prisma = makePrisma();
    const digest = new DailyDigest({ prisma, email });
    await digest.run();
    expect(email.send).toHaveBeenCalledOnce();
    const [subject] = (email.send as any).mock.calls[0];
    expect(subject).toContain('Resumen Flight Hunter');
  });

  it('does not send email when no searches exist', async () => {
    const prisma = makePrisma([]);
    const digest = new DailyDigest({ prisma, email });
    await digest.run();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('does not send email when all searches have no results', async () => {
    const prisma = makePrisma([makeSearch({ flightResults: [] })]);
    const digest = new DailyDigest({ prisma, email });
    await digest.run();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('updates lastDigestSentAt after sending', async () => {
    const prisma = makePrisma();
    const digest = new DailyDigest({ prisma, email });
    await digest.run();
    expect((prisma.search.updateMany as any)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastDigestSentAt: expect.any(Date) }),
      }),
    );
  });

  it('skips searches with no price change since last digest', async () => {
    const yesterday = new Date(Date.now() - 22 * 60 * 60 * 1000);
    const search = makeSearch({ lastDigestSentAt: yesterday });
    const prisma = makePrisma([search]);
    // Simulate same min price at last digest time
    (prisma.flightResult.aggregate as any).mockResolvedValue({ _min: { pricePerPerson: 300 } });

    const digest = new DailyDigest({ prisma, email });
    await digest.run();
    // price change = 300 - 300 = 0, so skip
    expect(email.send).not.toHaveBeenCalled();
  });

  it('includes search if price changed since last digest', async () => {
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const search = makeSearch({ lastDigestSentAt: yesterday });
    const prisma = makePrisma([search]);
    // Previous min was 330, current is 300 → change = -30
    (prisma.flightResult.aggregate as any).mockResolvedValue({ _min: { pricePerPerson: 330 } });

    const digest = new DailyDigest({ prisma, email });
    await digest.run();
    expect(email.send).toHaveBeenCalledOnce();
  });

  describe('frequency enforcement', () => {
    it('skips search if daily frequency and last sent < 1 day ago', async () => {
      const halfDayAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      const search = makeSearch({ lastDigestSentAt: halfDayAgo, digestFrequency: 'daily' });
      const prisma = makePrisma([search]);
      const digest = new DailyDigest({ prisma, email });
      await digest.run();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('skips search if every2days frequency and last sent < 2 days ago', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const search = makeSearch({ lastDigestSentAt: oneDayAgo, digestFrequency: 'every2days' });
      const prisma = makePrisma([search]);
      const digest = new DailyDigest({ prisma, email });
      await digest.run();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('skips search if weekly frequency and last sent < 7 days ago', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const search = makeSearch({ lastDigestSentAt: threeDaysAgo, digestFrequency: 'weekly' });
      const prisma = makePrisma([search]);
      const digest = new DailyDigest({ prisma, email });
      await digest.run();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('skips searches with digestFrequency=off', async () => {
      const search = makeSearch({ digestFrequency: 'off' });
      const prisma = makePrisma([search]);
      const digest = new DailyDigest({ prisma, email });
      await digest.run();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('sends if weekly frequency and 7+ days have passed', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const search = makeSearch({ lastDigestSentAt: eightDaysAgo, digestFrequency: 'weekly' });
      const prisma = makePrisma([search]);
      (prisma.flightResult.aggregate as any).mockResolvedValue({ _min: { pricePerPerson: 350 } });

      const digest = new DailyDigest({ prisma, email });
      await digest.run();
      expect(email.send).toHaveBeenCalledOnce();
    });

    it('sends if every2days frequency and 2+ days have passed', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const search = makeSearch({ lastDigestSentAt: threeDaysAgo, digestFrequency: 'every2days' });
      const prisma = makePrisma([search]);
      (prisma.flightResult.aggregate as any).mockResolvedValue({ _min: { pricePerPerson: 350 } });

      const digest = new DailyDigest({ prisma, email });
      await digest.run();
      expect(email.send).toHaveBeenCalledOnce();
    });
  });

  it('sends email with no prior digest (null lastDigestSentAt)', async () => {
    const search = makeSearch({ lastDigestSentAt: null });
    const prisma = makePrisma([search]);
    const digest = new DailyDigest({ prisma, email });
    await digest.run();
    expect(email.send).toHaveBeenCalledOnce();
  });

  it('includes top 3 results in the digest', async () => {
    const results = [
      makeResult({ id: 'r1', pricePerPerson: 285 }),
      makeResult({ id: 'r2', pricePerPerson: 305 }),
      makeResult({ id: 'r3', pricePerPerson: 320 }),
      makeResult({ id: 'r4', pricePerPerson: 400 }),
    ];
    const prisma = makePrisma([makeSearch({ flightResults: results })]);
    const digest = new DailyDigest({ prisma, email });
    await digest.run();
    const [, html] = (email.send as any).mock.calls[0];
    expect(html).toContain('285');
    expect(html).toContain('305');
    expect(html).toContain('320');
  });

  it('handles prisma aggregate returning null (no previous data)', async () => {
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const search = makeSearch({ lastDigestSentAt: yesterday });
    const prisma = makePrisma([search]);
    (prisma.flightResult.aggregate as any).mockResolvedValue({ _min: { pricePerPerson: null } });

    const digest = new DailyDigest({ prisma, email });
    // Should send because minPriceChange is undefined (no previous data)
    await digest.run();
    expect(email.send).toHaveBeenCalledOnce();
  });
});
