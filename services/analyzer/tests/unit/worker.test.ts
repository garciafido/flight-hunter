import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyzerWorker } from '../../src/worker.js';
import type { AnalyzerDeps } from '../../src/worker.js';
import type { PrismaClient } from '@flight-hunter/shared';
import type { RawResultJob } from '@flight-hunter/shared';
import type { Job } from 'bullmq';
import { FilterEngine } from '../../src/filters/filter-engine.js';
import { DealDetector } from '../../src/detection/deal-detector.js';
import { HistoryService } from '../../src/detection/history.js';
import { Publisher } from '../../src/publisher.js';

function makeRawJob(overrides: Partial<RawResultJob> = {}): Job<RawResultJob> {
  const data: RawResultJob = {
    searchId: 'search-1',
    source: 'kiwi',
    outbound: {
      departure: { airport: 'SCL', time: '10:00' },
      arrival: { airport: 'MIA', time: '18:00' },
      airline: 'LA',
      flightNumber: 'LA800',
      durationMinutes: 480,
      stops: 0,
    },
    inbound: {
      departure: { airport: 'MIA', time: '09:00' },
      arrival: { airport: 'SCL', time: '17:00' },
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
    bookingUrl: 'https://example.com',
    scrapedAt: new Date().toISOString(),
    proxyRegion: 'CL',
    ...overrides,
  };
  return { data, id: 'job-1' } as Job<RawResultJob>;
}

function makeSearchRecord(alertConfig = {}, filters = {}, stopover?: object) {
  return {
    id: 'search-1',
    name: 'Test Search',
    origin: 'SCL',
    destination: 'MIA',
    stopover: stopover ?? null,
    filters: {
      airlineBlacklist: [],
      airlinePreferred: [],
      airportPreferred: {},
      airportBlacklist: {},
      maxUnplannedStops: 2,
      minConnectionTime: 60,
      maxConnectionTime: 480,
      requireCarryOn: false,
      maxTotalTravelTime: 2880,
      ...filters,
    },
    alertConfig: {
      scoreThresholds: { info: 50, good: 70, urgent: 85 },
      maxPricePerPerson: 1500,
      currency: 'USD',
      ...alertConfig,
    },
  };
}

function makeDeps(searchRecord: object | null = makeSearchRecord()): AnalyzerDeps {
  const prisma = {
    search: {
      findUnique: vi.fn().mockResolvedValue(searchRecord),
    },
    flightResult: {
      create: vi.fn().mockResolvedValue({ id: 'result-1' }),
    },
  } as unknown as PrismaClient;

  const historyService = {
    getPriceHistory: vi.fn().mockResolvedValue(null),
  } as unknown as HistoryService;

  const filterEngine = new FilterEngine();
  const dealDetector = new DealDetector();

  const publisher = {
    publish: vi.fn().mockResolvedValue(undefined),
  } as unknown as Publisher;

  return { prisma, historyService, filterEngine, dealDetector, publisher };
}

describe('AnalyzerWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws error when search not found', async () => {
    const deps = makeDeps(null);
    const worker = new AnalyzerWorker(deps);
    await expect(worker.process(makeRawJob())).rejects.toThrow('Search not found: search-1');
  });

  it('processes a valid flight and calls publisher', async () => {
    const deps = makeDeps();
    const worker = new AnalyzerWorker(deps);
    await worker.process(makeRawJob());
    expect(deps.publisher.publish).toHaveBeenCalledOnce();
  });

  it('normalizes price per person', async () => {
    const deps = makeDeps();
    const worker = new AnalyzerWorker(deps);
    // pricePer=total, passengers=2, totalPrice=1000 → pricePerPerson=500
    await worker.process(makeRawJob({ pricePer: 'total', totalPrice: 1000, passengers: 2 }));
    const call = vi.mocked(deps.publisher.publish).mock.calls[0][0];
    expect(call.pricePerPerson).toBe(500);
  });

  it('publishes with null alertLevel for filtered-out flights', async () => {
    const deps = makeDeps(makeSearchRecord({}, { airlineBlacklist: ['LA'] }));
    const worker = new AnalyzerWorker(deps);
    await worker.process(makeRawJob());
    const call = vi.mocked(deps.publisher.publish).mock.calls[0][0];
    expect(call.alertLevel).toBeNull();
    expect(call.score).toBe(0);
  });

  it('uses history from history service', async () => {
    const history = { avg48h: 1000, minHistoric: 900 };
    const deps = makeDeps();
    vi.mocked(deps.historyService.getPriceHistory).mockResolvedValue(history);
    const worker = new AnalyzerWorker(deps);
    await worker.process(makeRawJob({ totalPrice: 600, pricePer: 'person' }));
    expect(deps.historyService.getPriceHistory).toHaveBeenCalledWith('search-1');
  });

  it('detects alert when score is high enough', async () => {
    // Set up so price=300 is well below max=1500 with high score thresholds
    const deps = makeDeps(
      makeSearchRecord({
        scoreThresholds: { info: 10, good: 20, urgent: 30 },
        maxPricePerPerson: 1500,
      }),
    );
    const worker = new AnalyzerWorker(deps);
    await worker.process(makeRawJob({ totalPrice: 300, pricePer: 'person' }));
    const call = vi.mocked(deps.publisher.publish).mock.calls[0][0];
    // With such low thresholds, score should trigger something
    expect(call.alertLevel).not.toBeNull();
  });

  it('includes score breakdown with flexibility hardcoded to 50', async () => {
    const deps = makeDeps();
    const worker = new AnalyzerWorker(deps);
    await worker.process(makeRawJob());
    const call = vi.mocked(deps.publisher.publish).mock.calls[0][0];
    expect(call.scoreBreakdown.flexibility).toBe(50);
  });

  it('passes stopover config from search to stopover score', async () => {
    const stopoverConfig = { airport: 'NYC', minDays: 2, maxDays: 4 };
    const deps = makeDeps(makeSearchRecord({}, {}, stopoverConfig));
    const worker = new AnalyzerWorker(deps);
    // Flight without stopover but search requires stopover → stopover score = 0
    await worker.process(makeRawJob());
    const call = vi.mocked(deps.publisher.publish).mock.calls[0][0];
    expect(call.scoreBreakdown.stopover).toBe(0);
  });

  it('passes stopover from job to stopover score', async () => {
    const stopoverConfig = { airport: 'NYC', minDays: 2, maxDays: 4 };
    const deps = makeDeps(makeSearchRecord({}, {}, stopoverConfig));
    const worker = new AnalyzerWorker(deps);
    const job = makeRawJob({
      stopover: {
        airport: 'NYC',
        arrivalTime: new Date().toISOString(),
        departureTime: new Date(Date.now() + 3 * 86400000).toISOString(),
        durationDays: 3,
      },
    });
    await worker.process(job);
    const call = vi.mocked(deps.publisher.publish).mock.calls[0][0];
    expect(call.scoreBreakdown.stopover).toBe(100);
  });

  it('converts scrapedAt string to Date', async () => {
    const deps = makeDeps();
    const worker = new AnalyzerWorker(deps);
    await worker.process(makeRawJob({ scrapedAt: '2024-01-01T00:00:00Z' }));
    const call = vi.mocked(deps.publisher.publish).mock.calls[0][0];
    expect(call.flight.scrapedAt).toBeInstanceOf(Date);
  });

  it('handles null history gracefully', async () => {
    const deps = makeDeps();
    vi.mocked(deps.historyService.getPriceHistory).mockResolvedValue(null);
    const worker = new AnalyzerWorker(deps);
    await expect(worker.process(makeRawJob())).resolves.not.toThrow();
  });
});
