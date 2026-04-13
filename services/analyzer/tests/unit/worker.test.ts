import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyzerWorker } from '../../src/worker.js';
import type { AnalyzerDeps } from '../../src/worker.js';
import type { PrismaClient } from '@flight-hunter/shared/db';
import type { RawResultJob } from '@flight-hunter/shared';
import { FilterEngine } from '../../src/filters/filter-engine.js';
import { DealDetector } from '../../src/detection/deal-detector.js';
import { HistoryService } from '../../src/detection/history.js';
import { OutlierDetector } from '../../src/detection/outlier-detector.js';
import { Publisher } from '../../src/publisher.js';

function makeRawJob(overrides: Partial<RawResultJob> = {}): RawResultJob {
  return {
    searchId: 'search-1',
    source: 'google-flights',
    outbound: {
      departure: { airport: 'BUE', time: '10:00' },
      arrival: { airport: 'LIM', time: '14:00' },
      airline: 'LA',
      flightNumber: 'LA800',
      durationMinutes: 240,
      stops: 0,
    },
    inbound: {
      departure: { airport: 'CUZ', time: '09:00' },
      arrival: { airport: 'BUE', time: '17:00' },
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
}

/** Canonical waypoint search fixture: BUE → LIM (stay) → CUZ (stay) → BUE */
function makeSearchRecord(alertConfig = {}, filters = {}) {
  return {
    id: 'search-1',
    name: 'Test Search',
    origin: 'BUE',
    waypoints: [
      { airport: 'LIM', gap: { type: 'stay', minDays: 3, maxDays: 4 } },
      { airport: 'CUZ', gap: { type: 'stay', minDays: 7, maxDays: 10 } },
    ],
    maxConnectionHours: 6,
    filters: {
      airlineBlacklist: [],
      airlinePreferred: [],
      airportPreferred: {},
      airportBlacklist: {},
      maxUnplannedStops: 2,
      requireCarryOn: false,
      maxTotalTravelTime: 2880,
      ...filters,
    },
    alertConfig: {
      scoreThresholds: { info: 50, good: 70, urgent: 85 },
      maxPrice: 1500,
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
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;

  const historyService = {
    getPriceHistory: vi.fn().mockResolvedValue(null),
  } as unknown as HistoryService;

  const filterEngine = new FilterEngine();
  const dealDetector = new DealDetector();
  const outlierDetector = new OutlierDetector(prisma);

  const publisher = {
    publish: vi.fn().mockResolvedValue(undefined),
  } as unknown as Publisher;

  return { prisma, historyService, filterEngine, dealDetector, outlierDetector, publisher };
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

  it('single-flight publish always uses null alertLevel (combo alert fires separately)', async () => {
    const deps = makeDeps(
      makeSearchRecord({
        scoreThresholds: { info: 10, good: 20, urgent: 30 },
        maxPrice: 1500,
      }),
    );
    const worker = new AnalyzerWorker(deps);
    await worker.process(makeRawJob({ totalPrice: 300, pricePer: 'person' }));
    const call = vi.mocked(deps.publisher.publish).mock.calls[0][0];
    // Single-flight alerts are suppressed — waypoint combos fire alerts instead
    expect(call.alertLevel).toBeNull();
  });

  it('includes score breakdown with flexibility hardcoded to 50', async () => {
    const deps = makeDeps();
    const worker = new AnalyzerWorker(deps);
    await worker.process(makeRawJob());
    const call = vi.mocked(deps.publisher.publish).mock.calls[0][0];
    expect(call.scoreBreakdown.flexibility).toBe(50);
  });

  it('returns 100 stopover score for a clean leg (no stopover)', async () => {
    const deps = makeDeps(makeSearchRecord());
    const worker = new AnalyzerWorker(deps);
    await worker.process(makeRawJob());
    const call = vi.mocked(deps.publisher.publish).mock.calls[0][0];
    expect(call.scoreBreakdown.stopover).toBe(100);
  });

  it('returns 100 stopover score when the leg has a stopover', async () => {
    const deps = makeDeps(makeSearchRecord());
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

// Combo evaluation tests moved to combo-evaluator.test.ts — the AnalyzerWorker
// no longer evaluates combos; that's handled by the evaluate-combos queue.
