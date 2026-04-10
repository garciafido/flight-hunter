import { describe, it, expect } from 'vitest';
import { buildCombos, scoreCombo } from '../../../src/combos/combo-builder.js';
import type { FlightResult, SearchConfig } from '@flight-hunter/shared';

function makeFlight(overrides: Partial<FlightResult> & { departureTime?: string; price?: number } = {}): FlightResult {
  const { departureTime = '2026-07-25T10:00:00.000Z', price = 300, ...rest } = overrides;
  return {
    searchId: 'search-1',
    source: 'google-flights',
    outbound: {
      departure: { airport: 'BUE', time: departureTime },
      arrival: { airport: 'CUZ', time: departureTime },
      airline: 'LATAM',
      flightNumber: 'N/A',
      durationMinutes: 0,
      stops: 0,
    },
    inbound: {
      departure: { airport: 'CUZ', time: departureTime },
      arrival: { airport: 'BUE', time: departureTime },
      airline: 'LATAM',
      flightNumber: 'N/A',
      durationMinutes: 0,
      stops: 0,
    },
    totalPrice: price,
    currency: 'USD',
    pricePer: 'total',
    passengers: 1,
    carryOnIncluded: true,
    bookingUrl: 'https://example.com',
    scrapedAt: new Date(),
    proxyRegion: 'AR',
    ...rest,
  };
}

function makeSearchConfig(maxPricePerPerson = 1500): SearchConfig {
  return {
    id: 'search-1',
    name: 'Test Split Search',
    origin: 'BUE',
    destination: 'CUZ',
    departureFrom: new Date('2026-07-25'),
    departureTo: new Date('2026-07-31'),
    returnMinDays: 7,
    returnMaxDays: 14,
    passengers: 1,
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
      maxPricePerPerson,
      currency: 'USD',
    },
    proxyRegions: ['AR'],
    scanIntervalMin: 60,
    active: true,
    mode: 'split',
  };
}

describe('buildCombos', () => {
  it('returns empty array when no legs provided', () => {
    expect(buildCombos([])).toEqual([]);
  });

  it('returns each result as a single-item combo for one leg', () => {
    const leg0 = [makeFlight({ departureTime: '2026-07-25T10:00:00.000Z' })];
    const combos = buildCombos([leg0]);
    expect(combos).toHaveLength(1);
    expect(combos[0]).toHaveLength(1);
  });

  it('generates valid Cartesian product for two legs', () => {
    const leg0 = [
      makeFlight({ departureTime: '2026-07-25T10:00:00.000Z', price: 200 }),
      makeFlight({ departureTime: '2026-07-26T10:00:00.000Z', price: 250 }),
    ];
    const leg1 = [
      makeFlight({ departureTime: '2026-08-10T10:00:00.000Z', price: 180 }),
      makeFlight({ departureTime: '2026-08-15T10:00:00.000Z', price: 160 }),
    ];

    const combos = buildCombos([leg0, leg1]);
    // All combos: leg0[0]+leg1[0], leg0[0]+leg1[1], leg0[1]+leg1[0], leg0[1]+leg1[1] — all valid
    expect(combos).toHaveLength(4);
    expect(combos.every(c => c.length === 2)).toBe(true);
  });

  it('filters out combos where leg1 departure is not after leg0 departure', () => {
    const leg0 = [makeFlight({ departureTime: '2026-08-15T10:00:00.000Z', price: 300 })];
    const leg1 = [
      makeFlight({ departureTime: '2026-08-10T10:00:00.000Z', price: 200 }), // before leg0 → invalid
      makeFlight({ departureTime: '2026-08-20T10:00:00.000Z', price: 200 }), // after leg0 → valid
    ];

    const combos = buildCombos([leg0, leg1]);
    expect(combos).toHaveLength(1);
    expect(combos[0][1].outbound.departure.time).toBe('2026-08-20T10:00:00.000Z');
  });

  it('caps each leg to topN results by price', () => {
    const leg0 = Array.from({ length: 10 }, (_, i) =>
      makeFlight({ departureTime: '2026-07-25T10:00:00.000Z', price: 100 + i }),
    );
    const leg1 = Array.from({ length: 10 }, (_, i) =>
      makeFlight({ departureTime: '2026-08-10T10:00:00.000Z', price: 200 + i }),
    );

    const combos = buildCombos([leg0, leg1], 3);
    // 3 * 3 = 9 combinations max
    expect(combos).toHaveLength(9);
  });

  it('returns empty array if one leg has no results', () => {
    const leg0 = [makeFlight({ departureTime: '2026-07-25T10:00:00.000Z' })];
    const leg1: FlightResult[] = [];
    const combos = buildCombos([leg0, leg1]);
    expect(combos).toHaveLength(0);
  });

  it('handles three legs with temporal ordering', () => {
    const leg0 = [makeFlight({ departureTime: '2026-07-25T10:00:00.000Z', price: 200 })];
    const leg1 = [makeFlight({ departureTime: '2026-08-10T10:00:00.000Z', price: 150 })];
    const leg2 = [makeFlight({ departureTime: '2026-09-01T10:00:00.000Z', price: 220 })];

    const combos = buildCombos([leg0, leg1, leg2]);
    expect(combos).toHaveLength(1);
    expect(combos[0]).toHaveLength(3);
  });

  it('sorts candidates by price before capping', () => {
    const leg0 = [
      makeFlight({ departureTime: '2026-07-25T10:00:00.000Z', price: 500 }),
      makeFlight({ departureTime: '2026-07-26T10:00:00.000Z', price: 100 }),
    ];
    const leg1 = [makeFlight({ departureTime: '2026-08-10T10:00:00.000Z', price: 200 })];

    const combos = buildCombos([leg0, leg1], 1);
    // With topN=1, only cheapest from leg0 (price=100) should be kept
    expect(combos).toHaveLength(1);
    expect(combos[0][0].totalPrice).toBe(100);
  });
});

describe('scoreCombo', () => {
  it('returns a score between 0 and 100', () => {
    const combo = [
      makeFlight({ departureTime: '2026-07-25T10:00:00.000Z', price: 300 }),
      makeFlight({ departureTime: '2026-08-10T10:00:00.000Z', price: 200 }),
    ];
    const { score } = scoreCombo(combo, makeSearchConfig());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns priceScore of 0 when total price equals or exceeds maxPricePerPerson', () => {
    const combo = [
      makeFlight({ departureTime: '2026-07-25T10:00:00.000Z', price: 1500 }),
    ];
    const { breakdown } = scoreCombo(combo, makeSearchConfig(1500));
    expect(breakdown.price).toBe(0);
  });

  it('returns higher score for lower price relative to max', () => {
    const cheapCombo = [makeFlight({ departureTime: '2026-07-25T10:00:00.000Z', price: 100 })];
    const expensiveCombo = [makeFlight({ departureTime: '2026-07-25T10:00:00.000Z', price: 900 })];

    const cheapScore = scoreCombo(cheapCombo, makeSearchConfig(1000));
    const expensiveScore = scoreCombo(expensiveCombo, makeSearchConfig(1000));

    expect(cheapScore.score).toBeGreaterThan(expensiveScore.score);
  });

  it('returns a breakdown with expected keys', () => {
    const combo = [makeFlight({ departureTime: '2026-07-25T10:00:00.000Z', price: 300 })];
    const { breakdown } = scoreCombo(combo, makeSearchConfig());
    expect(breakdown).toHaveProperty('price');
    expect(breakdown).toHaveProperty('schedule');
    expect(breakdown).toHaveProperty('stopover');
    expect(breakdown).toHaveProperty('airline');
    expect(breakdown).toHaveProperty('flexibility');
  });

  it('accumulates totalPrice across all legs', () => {
    const combo = [
      makeFlight({ departureTime: '2026-07-25T10:00:00.000Z', price: 400 }),
      makeFlight({ departureTime: '2026-08-10T10:00:00.000Z', price: 400 }),
    ];
    // totalPrice = 800, max = 1000 → priceScore = round(100 * (1 - 800/1000)) = 20
    const { breakdown } = scoreCombo(combo, makeSearchConfig(1000));
    expect(breakdown.price).toBe(20);
  });
});
