import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComboEvaluator } from '../../src/combo-evaluator.js';
import type { PrismaClient } from '@flight-hunter/shared/db';
import { DealDetector } from '../../src/detection/deal-detector.js';
import { Publisher } from '../../src/publisher.js';

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

describe('ComboEvaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('evaluates combos for a 3-leg waypoint search (BUE→LIM→CUZ→BUE)', async () => {
    const searchRecord = makeWaypointSearchRecord(100);

    const allRows = [
      makeFlightResultRow('BUE', 'LIM', 200, '2026-07-01T10:00:00.000Z', 'r-bue-lim'),
      makeFlightResultRow('LIM', 'CUZ', 150, '2026-07-05T10:00:00.000Z', 'r-lim-cuz'),
      makeFlightResultRow('CUZ', 'BUE', 220, '2026-07-12T10:00:00.000Z', 'r-cuz-bue'),
    ];

    const prisma = {
      search: { findUnique: vi.fn().mockResolvedValue(searchRecord) },
      flightResult: { findMany: vi.fn().mockResolvedValue(allRows) },
      flightCombo: { create: vi.fn().mockResolvedValue({ id: 'combo-1' }) },
    } as unknown as PrismaClient;

    const dealDetector = new DealDetector();
    const publishComboAlert = vi.fn().mockResolvedValue(undefined);
    const publisher = { publishComboAlert } as unknown as Publisher;

    const evaluator = new ComboEvaluator({ prisma, dealDetector, publisher });
    await evaluator.evaluate('search-1');

    expect(vi.mocked(prisma.flightCombo.create)).toHaveBeenCalledOnce();
    const comboData = vi.mocked(prisma.flightCombo.create).mock.calls[0][0].data;
    expect(comboData.searchId).toBe('search-1');
    expect(comboData.totalPrice).toBe(200 + 150 + 220);
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
      flightResult: { findMany: vi.fn().mockResolvedValue(allRows) },
      flightCombo: { create: vi.fn().mockResolvedValue({ id: 'combo-1' }) },
    } as unknown as PrismaClient;

    const dealDetector = new DealDetector();
    const publisher = { publishComboAlert: vi.fn() } as unknown as Publisher;

    const evaluator = new ComboEvaluator({ prisma, dealDetector, publisher });
    await expect(evaluator.evaluate('search-1')).resolves.not.toThrow();
  });

  it('skips combo evaluation when no flights match a leg pair', async () => {
    const searchRecord = makeWaypointSearchRecord(100);

    const allRows = [
      makeFlightResultRow('BUE', 'LIM', 200, '2026-07-01T10:00:00.000Z', 'r-bue-lim'),
    ];

    const prisma = {
      search: { findUnique: vi.fn().mockResolvedValue(searchRecord) },
      flightResult: { findMany: vi.fn().mockResolvedValue(allRows) },
      flightCombo: { create: vi.fn() },
    } as unknown as PrismaClient;

    const dealDetector = new DealDetector();
    const publisher = { publishComboAlert: vi.fn() } as unknown as Publisher;

    const evaluator = new ComboEvaluator({ prisma, dealDetector, publisher });
    await expect(evaluator.evaluate('search-1')).resolves.not.toThrow();

    expect(vi.mocked(prisma.flightCombo.create)).not.toHaveBeenCalled();
  });

  it('publishes combo alert when alertLevel qualifies', async () => {
    const searchRecord = makeWaypointSearchRecord(100);
    searchRecord.alertConfig.scoreThresholds = { info: 1, good: 2, urgent: 3 };
    searchRecord.alertConfig.maxPrice = 10000;

    const allRows = [
      makeFlightResultRow('BUE', 'LIM', 200, '2026-07-01T10:00:00.000Z', 'r-bue-lim'),
      makeFlightResultRow('LIM', 'CUZ', 150, '2026-07-05T10:00:00.000Z', 'r-lim-cuz'),
      makeFlightResultRow('CUZ', 'BUE', 220, '2026-07-12T10:00:00.000Z', 'r-cuz-bue'),
    ];

    const prisma = {
      search: { findUnique: vi.fn().mockResolvedValue(searchRecord) },
      flightResult: { findMany: vi.fn().mockResolvedValue(allRows) },
      flightCombo: { create: vi.fn().mockResolvedValue({ id: 'combo-1' }) },
    } as unknown as PrismaClient;

    const publishComboAlert = vi.fn().mockResolvedValue(undefined);
    const dealDetector = new DealDetector();
    const publisher = { publishComboAlert } as unknown as Publisher;

    const evaluator = new ComboEvaluator({ prisma, dealDetector, publisher });
    await evaluator.evaluate('search-1');

    expect(publishComboAlert).toHaveBeenCalledOnce();
    const opts = publishComboAlert.mock.calls[0][0];
    expect(opts.searchId).toBe('search-1');
    expect(opts.totalPricePerPerson).toBe(200 + 150 + 220);
    expect(opts.waypoints).toHaveLength(2);
    expect(opts.waypoints[0].airport).toBe('LIM');
    expect(opts.waypoints[0].type).toBe('stay');
    expect(opts.waypoints[1].airport).toBe('CUZ');
    expect(opts.waypoints[1].type).toBe('stay');
  });

  it('does nothing when search has no waypoints', async () => {
    const searchRecord = {
      id: 'search-1',
      name: 'Simple roundtrip',
      origin: 'BUE',
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
      flightResult: { findMany: vi.fn() },
      flightCombo: { create: vi.fn() },
    } as unknown as PrismaClient;

    const dealDetector = new DealDetector();
    const publisher = { publishComboAlert: vi.fn() } as unknown as Publisher;

    const evaluator = new ComboEvaluator({ prisma, dealDetector, publisher });
    await evaluator.evaluate('search-1');

    expect(vi.mocked(prisma.flightCombo.create)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.flightResult.findMany)).not.toHaveBeenCalled();
  });
});
