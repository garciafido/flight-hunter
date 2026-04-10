import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Publisher } from '../../src/publisher.js';
import type { FlightResult, ScoreBreakdown } from '@flight-hunter/shared';
import type { Queue } from 'bullmq';
import type { PrismaClient } from '@flight-hunter/shared';

function makeFlight(overrides: Partial<FlightResult> = {}): FlightResult {
  return {
    searchId: 'search-1',
    source: 'kiwi',
    outbound: {
      departure: { airport: 'SCL', time: '2024-03-15T10:00:00Z' },
      arrival: { airport: 'MIA', time: '2024-03-15T18:00:00Z' },
      airline: 'LA',
      flightNumber: 'LA800',
      durationMinutes: 480,
      stops: 0,
    },
    inbound: {
      departure: { airport: 'MIA', time: '2024-03-20T09:00:00Z' },
      arrival: { airport: 'SCL', time: '2024-03-20T17:00:00Z' },
      airline: 'LA',
      flightNumber: 'LA801',
      durationMinutes: 480,
      stops: 0,
    },
    totalPrice: 800,
    currency: 'USD',
    pricePer: 'person',
    passengers: 1,
    carryOnIncluded: true,
    bookingUrl: 'https://example.com/book',
    scrapedAt: new Date('2024-03-10T12:00:00Z'),
    proxyRegion: 'CL',
    ...overrides,
  };
}

const baseBreakdown: ScoreBreakdown = {
  price: 80,
  schedule: 70,
  stopover: 100,
  airline: 75,
  flexibility: 50,
};

function makePrismaMock() {
  return {
    flightResult: {
      create: vi.fn().mockResolvedValue({ id: 'result-uuid-1' }),
      aggregate: vi.fn().mockResolvedValue({
        _min: { pricePerPerson: null, score: null },
        _max: { pricePerPerson: null },
        _avg: { pricePerPerson: null },
        _count: { id: 0 },
      }),
    },
    priceHistory: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'ph-1' }),
      update: vi.fn().mockResolvedValue({ id: 'ph-1' }),
    },
  } as unknown as PrismaClient;
}

function makeQueueMock() {
  return {
    add: vi.fn().mockResolvedValue({}),
  } as unknown as Queue;
}

describe('Publisher', () => {
  let prisma: PrismaClient;
  let queue: Queue;
  let publisher: Publisher;

  beforeEach(() => {
    prisma = makePrismaMock();
    queue = makeQueueMock();
    publisher = new Publisher(queue, prisma);
  });

  it('saves flight result to database', async () => {
    await publisher.publish({
      flight: makeFlight(),
      pricePerPerson: 800,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: null,
    });

    expect(prisma.flightResult.create).toHaveBeenCalledOnce();
    const data = vi.mocked(prisma.flightResult.create).mock.calls[0][0].data;
    expect(data.searchId).toBe('search-1');
    expect(data.source).toBe('kiwi');
    expect(Number(data.pricePerPerson)).toBe(800);
    expect(data.currency).toBe('USD');
    expect(data.bookingUrl).toBe('https://example.com/book');
  });

  it('does not publish to alert queue when alertLevel is null', async () => {
    await publisher.publish({
      flight: makeFlight(),
      pricePerPerson: 800,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: null,
    });

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('publishes alert job when alertLevel is set', async () => {
    await publisher.publish({
      flight: makeFlight(),
      pricePerPerson: 800,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: 'good',
    });

    expect(queue.add).toHaveBeenCalledOnce();
    const [jobName, jobData] = vi.mocked(queue.add).mock.calls[0];
    expect(jobName).toBe('alert');
    expect(jobData.level).toBe('good');
    expect(jobData.score).toBe(75);
    expect(jobData.flightResultId).toBe('result-uuid-1');
    expect(jobData.searchId).toBe('search-1');
  });

  it('includes score breakdown in alert job', async () => {
    await publisher.publish({
      flight: makeFlight(),
      pricePerPerson: 800,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: 'urgent',
    });

    const jobData = vi.mocked(queue.add).mock.calls[0][1];
    expect(jobData.scoreBreakdown).toEqual(baseBreakdown);
  });

  it('includes flight summary in alert job', async () => {
    await publisher.publish({
      flight: makeFlight(),
      pricePerPerson: 800,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: 'info',
    });

    const jobData = vi.mocked(queue.add).mock.calls[0][1];
    expect(jobData.flightSummary.airline).toBe('LA');
    expect(jobData.flightSummary.departureAirport).toBe('SCL');
    expect(jobData.flightSummary.arrivalAirport).toBe('MIA');
    expect(jobData.flightSummary.price).toBe(800);
    expect(jobData.flightSummary.currency).toBe('USD');
    expect(jobData.flightSummary.bookingUrl).toBe('https://example.com/book');
  });

  it('calculates priceTotal correctly for pricePer=person', async () => {
    const flight = makeFlight({ pricePer: 'person', totalPrice: 500, passengers: 2 });
    await publisher.publish({
      flight,
      pricePerPerson: 500,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: null,
    });

    const data = vi.mocked(prisma.flightResult.create).mock.calls[0][0].data;
    expect(Number(data.priceTotal)).toBe(1000); // 500 * 2
  });

  it('calculates priceTotal correctly for pricePer=total', async () => {
    const flight = makeFlight({ pricePer: 'total', totalPrice: 1000, passengers: 2 });
    await publisher.publish({
      flight,
      pricePerPerson: 500,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: null,
    });

    const data = vi.mocked(prisma.flightResult.create).mock.calls[0][0].data;
    expect(Number(data.priceTotal)).toBe(1000);
  });

  it('saves stopover info when present', async () => {
    const flight = makeFlight({
      stopover: {
        airport: 'NYC',
        arrivalTime: '2024-03-16T10:00:00Z',
        departureTime: '2024-03-17T10:00:00Z',
        durationDays: 1,
      },
    });

    await publisher.publish({
      flight,
      pricePerPerson: 800,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: null,
    });

    const data = vi.mocked(prisma.flightResult.create).mock.calls[0][0].data;
    expect(data.stopoverInfo).toBeDefined();
  });

  it('includes stopover in alert flight summary', async () => {
    const flight = makeFlight({
      stopover: {
        airport: 'NYC',
        arrivalTime: '2024-03-16T10:00:00Z',
        departureTime: '2024-03-17T10:00:00Z',
        durationDays: 2,
      },
    });

    await publisher.publish({
      flight,
      pricePerPerson: 800,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: 'good',
    });

    const jobData = vi.mocked(queue.add).mock.calls[0][1];
    expect(jobData.flightSummary.stopoverAirport).toBe('NYC');
    expect(jobData.flightSummary.stopoverDurationDays).toBe(2);
  });

  it('saves alertLevel when present', async () => {
    await publisher.publish({
      flight: makeFlight(),
      pricePerPerson: 800,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: 'urgent',
    });

    const data = vi.mocked(prisma.flightResult.create).mock.calls[0][0].data;
    expect(data.alertLevel).toBe('urgent');
  });

  it('does not include alertLevel field when null', async () => {
    await publisher.publish({
      flight: makeFlight(),
      pricePerPerson: 800,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: null,
    });

    const data = vi.mocked(prisma.flightResult.create).mock.calls[0][0].data;
    expect(data.alertLevel).toBeUndefined();
  });

  it('logs error and does not throw when price aggregation fails', async () => {
    (prisma.flightResult.aggregate as any).mockRejectedValueOnce(new Error('db error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Let the fire-and-forget aggregation settle
    await publisher.publish({
      flight: makeFlight(),
      pricePerPerson: 800,
      score: 75,
      scoreBreakdown: baseBreakdown,
      alertLevel: null,
    });

    // Allow the microtask queue (the rejected void promise) to flush
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(consoleSpy).toHaveBeenCalledWith(
      'PriceAggregator: failed to aggregate',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
