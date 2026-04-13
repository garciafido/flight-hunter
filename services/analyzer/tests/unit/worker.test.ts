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

describe('AnalyzerWorker waypoint sequence evaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Search with BUE → LIM (stay 3-4d) → CUZ (stay 7-10d) → BUE */
  function makeWaypointSearchRecord(maxCombos = 100) {
    return {
      id: 'search-1',
      name: 'BUE-LIM-CUZ Waypoint',
      origin: 'BUE',
      passengers: 2,
      waypoints: [
        { airport: 'LIM', gap: { type: 'stay', minDays: 3, maxDays: 4 } },
        { airport: 'CUZ', gap: { type: 'stay', minDays: 7, maxDays: 10 } },
      ],
      maxConnectionHours: 6,
      maxCombos,
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
      },
      alertConfig: {
        scoreThresholds: { info: 50, good: 70, urgent: 85 },
        maxPrice: 2000,
        currency: 'USD',
      },
      stopover: null,
    };
  }

  function makeFlightResultRow(
    depAirport: string,
    arrAirport: string,
    price: number,
    deptTime: string,
    id: string,
  ) {
    return {
      id,
      searchId: 'search-1',
      source: 'google-flights',
      outbound: {
        departure: { airport: depAirport, time: deptTime },
        arrival: { airport: arrAirport, time: deptTime },
        airline: 'LA',
        flightNumber: 'LA1',
        durationMinutes: 180,
        stops: 0,
      },
      inbound: {
        departure: { airport: arrAirport, time: deptTime },
        arrival: { airport: depAirport, time: deptTime },
        airline: 'LA',
        flightNumber: 'LA2',
        durationMinutes: 180,
        stops: 0,
      },
      pricePerPerson: price,
      currency: 'USD',
      carryOnIncluded: true,
      bookingUrl: 'https://example.com',
      proxyRegion: 'AR',
      scrapedAt: new Date(),
    };
  }

  it('evaluates combos for a 3-leg waypoint search (BUE→LIM→CUZ→BUE)', async () => {
    const searchRecord = makeWaypointSearchRecord(100);

    // Note: dates must satisfy gap constraints: LIM stay 3-4d, CUZ stay 7-10d
    // BUE→LIM departs 2026-07-01, LIM→CUZ departs 2026-07-05 (4d gap ✓ 3-4d)
    // LIM→CUZ departs 2026-07-05, CUZ→BUE departs 2026-07-12 (7d gap ✓ 7-10d)
    const allRows = [
      makeFlightResultRow('BUE', 'LIM', 200, '2026-07-01T10:00:00.000Z', 'r-bue-lim'),
      makeFlightResultRow('LIM', 'CUZ', 150, '2026-07-05T10:00:00.000Z', 'r-lim-cuz'),
      makeFlightResultRow('CUZ', 'BUE', 220, '2026-07-12T10:00:00.000Z', 'r-cuz-bue'),
    ];

    const prisma = {
      search: { findUnique: vi.fn().mockResolvedValue(searchRecord) },
      flightResult: {
        create: vi.fn().mockResolvedValue({ id: 'result-1' }),
        findMany: vi.fn().mockResolvedValue(allRows),
      },
      flightCombo: { create: vi.fn().mockResolvedValue({ id: 'combo-1' }) },
    } as unknown as PrismaClient;

    const deps = makeDeps(searchRecord);
    (deps as any).prisma = prisma;
    (deps.publisher as any).publish = vi.fn().mockResolvedValue(undefined);

    const worker = new AnalyzerWorker(deps);
    await worker.process(makeRawJob({ searchId: 'search-1' }));

    // Publisher.publish is called for the single-flight result
    expect(deps.publisher.publish).toHaveBeenCalled();

    // FlightCombo.create should be called once (one permutation, one valid combo)
    expect(vi.mocked(prisma.flightCombo.create)).toHaveBeenCalledOnce();
    const comboData = vi.mocked(prisma.flightCombo.create).mock.calls[0][0].data;
    expect(comboData.searchId).toBe('search-1');
    expect(comboData.totalPrice).toBe(200 + 150 + 220); // sum of leg prices
    expect(comboData.currency).toBe('USD');
  });

  it('uses maxCombos=100 as default when not set', async () => {
    const searchRecord = makeWaypointSearchRecord();
    delete (searchRecord as any).maxCombos;

    const allRows = [
      makeFlightResultRow('BUE', 'LIM', 200, '2026-07-01T10:00:00.000Z', 'r-bue-lim'),
      makeFlightResultRow('LIM', 'CUZ', 150, '2026-07-05T10:00:00.000Z', 'r-lim-cuz'),
      makeFlightResultRow('CUZ', 'BUE', 220, '2026-07-12T10:00:00.000Z', 'r-cuz-bue'),
    ];

    const prisma = {
      search: { findUnique: vi.fn().mockResolvedValue(searchRecord) },
      flightResult: {
        create: vi.fn().mockResolvedValue({ id: 'result-1' }),
        findMany: vi.fn().mockResolvedValue(allRows),
      },
      flightCombo: { create: vi.fn().mockResolvedValue({ id: 'combo-1' }) },
    } as unknown as PrismaClient;

    const deps = makeDeps(searchRecord);
    (deps as any).prisma = prisma;
    (deps.publisher as any).publish = vi.fn().mockResolvedValue(undefined);

    const worker = new AnalyzerWorker(deps);
    await expect(worker.process(makeRawJob({ searchId: 'search-1' }))).resolves.not.toThrow();
  });

  it('skips combo evaluation when no flights match a leg pair', async () => {
    const searchRecord = makeWaypointSearchRecord(100);

    // Only BUE→LIM flights exist; LIM→CUZ and CUZ→BUE are missing
    const allRows = [
      makeFlightResultRow('BUE', 'LIM', 200, '2026-07-01T10:00:00.000Z', 'r-bue-lim'),
    ];

    const prisma = {
      search: { findUnique: vi.fn().mockResolvedValue(searchRecord) },
      flightResult: {
        create: vi.fn().mockResolvedValue({ id: 'result-1' }),
        findMany: vi.fn().mockResolvedValue(allRows),
      },
      flightCombo: { create: vi.fn().mockResolvedValue({ id: 'combo-1' }) },
    } as unknown as PrismaClient;

    const deps = makeDeps(searchRecord);
    (deps as any).prisma = prisma;
    (deps.publisher as any).publish = vi.fn().mockResolvedValue(undefined);

    const worker = new AnalyzerWorker(deps);
    await expect(worker.process(makeRawJob({ searchId: 'search-1' }))).resolves.not.toThrow();

    // FlightCombo.create should NOT be called because legs are incomplete
    expect(vi.mocked(prisma.flightCombo.create)).not.toHaveBeenCalled();
  });

  it('publishes combo alert when alertLevel qualifies', async () => {
    const searchRecord = makeWaypointSearchRecord(100);
    // Low thresholds so any non-zero score triggers an alert
    searchRecord.alertConfig.scoreThresholds = { info: 1, good: 2, urgent: 3 };
    // maxPrice is now TOTAL TRIP (group). With 2 pax × ~570 per person = ~1140.
    // Set maxPrice high enough that it passes.
    searchRecord.alertConfig.maxPrice = 10000;

    const allRows = [
      makeFlightResultRow('BUE', 'LIM', 200, '2026-07-01T10:00:00.000Z', 'r-bue-lim'),
      makeFlightResultRow('LIM', 'CUZ', 150, '2026-07-05T10:00:00.000Z', 'r-lim-cuz'),
      makeFlightResultRow('CUZ', 'BUE', 220, '2026-07-12T10:00:00.000Z', 'r-cuz-bue'),
    ];

    const prisma = {
      search: { findUnique: vi.fn().mockResolvedValue(searchRecord) },
      flightResult: {
        create: vi.fn().mockResolvedValue({ id: 'result-1' }),
        findMany: vi.fn().mockResolvedValue(allRows),
      },
      flightCombo: { create: vi.fn().mockResolvedValue({ id: 'combo-1' }) },
    } as unknown as PrismaClient;

    const publishComboAlert = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps(searchRecord);
    (deps as any).prisma = prisma;
    (deps.publisher as any).publish = vi.fn().mockResolvedValue(undefined);
    (deps.publisher as any).publishComboAlert = publishComboAlert;

    const worker = new AnalyzerWorker(deps);
    await worker.process(makeRawJob({ searchId: 'search-1' }));

    expect(publishComboAlert).toHaveBeenCalledOnce();
    const opts = publishComboAlert.mock.calls[0][0];
    expect(opts.searchId).toBe('search-1');
    expect(opts.totalPricePerPerson).toBe(200 + 150 + 220);
    // waypoints payload should have LIM and CUZ entries
    expect(opts.waypoints).toHaveLength(2);
    expect(opts.waypoints[0].airport).toBe('LIM');
    expect(opts.waypoints[0].type).toBe('stay');
    expect(opts.waypoints[1].airport).toBe('CUZ');
    expect(opts.waypoints[1].type).toBe('stay');
    // No plan field
    expect(opts.plan).toBeUndefined();
  });

  it('does not call evaluateWaypointSequences when waypoints array is absent', async () => {
    // Search with no waypoints field — should not attempt combo evaluation
    const searchRecord = {
      id: 'search-1',
      name: 'Simple roundtrip',
      origin: 'BUE',
      // no waypoints
      filters: {
        airlineBlacklist: [],
        airlinePreferred: [],
        airportPreferred: {},
        airportBlacklist: {},
        maxUnplannedStops: 2,
        requireCarryOn: false,
        maxTotalTravelTime: 2880,
      },
      alertConfig: {
        scoreThresholds: { info: 50, good: 70, urgent: 85 },
        maxPrice: 1500,
        currency: 'USD',
      },
      stopover: null,
    };

    const prisma = {
      search: { findUnique: vi.fn().mockResolvedValue(searchRecord) },
      flightResult: {
        create: vi.fn().mockResolvedValue({ id: 'result-1' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      flightCombo: { create: vi.fn() },
    } as unknown as PrismaClient;

    const deps = makeDeps(searchRecord);
    (deps as any).prisma = prisma;

    const worker = new AnalyzerWorker(deps);
    await expect(worker.process(makeRawJob())).resolves.not.toThrow();

    // flightCombo.create should never be called
    expect(vi.mocked(prisma.flightCombo.create)).not.toHaveBeenCalled();
  });
});
