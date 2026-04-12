import { describe, it, expect } from 'vitest';
import { buildCombos, scoreCombo, topNPerLeg } from '../../../src/combos/combo-builder.js';
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

describe('topNPerLeg', () => {
  it('returns at least 2', () => {
    expect(topNPerLeg(4, 3)).toBeGreaterThanOrEqual(2);
    expect(topNPerLeg(1, 5)).toBe(2);
  });

  it('computes correct N for 2 legs', () => {
    // maxCombos=100, 2 legs → floor(100^(1/2))=10
    expect(topNPerLeg(100, 2)).toBe(10);
  });

  it('computes correct N for 3 legs', () => {
    // maxCombos=100, 3 legs → floor(100^(1/3))=4
    expect(topNPerLeg(100, 3)).toBe(4);
  });

  it('computes correct N for 4 legs', () => {
    // maxCombos=100, 4 legs → floor(100^(1/4))=3
    expect(topNPerLeg(100, 4)).toBe(3);
  });

  it('computes correct N for 5 legs', () => {
    // maxCombos=100, 5 legs → floor(100^(1/5))=2
    expect(topNPerLeg(100, 5)).toBe(2);
  });

  it('handles legCount=0 safely', () => {
    expect(topNPerLeg(100, 0)).toBe(2);
  });

  it('scales with larger maxCombos', () => {
    // maxCombos=1000, 3 legs → floor(1000^(1/3)) = floor(9.999...) = 9 due to JS floating point
    expect(topNPerLeg(1000, 3)).toBeGreaterThanOrEqual(9);
    expect(topNPerLeg(1000, 3)).toBeLessThanOrEqual(10);
  });
});

describe('buildCombos N-leg', () => {
  it('handles 4 legs with temporal ordering', () => {
    const leg0 = [makeFlight({ departureTime: '2026-07-01T10:00:00.000Z', price: 200 })];
    const leg1 = [makeFlight({ departureTime: '2026-07-15T10:00:00.000Z', price: 150 })];
    const leg2 = [makeFlight({ departureTime: '2026-08-01T10:00:00.000Z', price: 220 })];
    const leg3 = [makeFlight({ departureTime: '2026-08-20T10:00:00.000Z', price: 180 })];

    const combos = buildCombos([leg0, leg1, leg2, leg3]);
    expect(combos).toHaveLength(1);
    expect(combos[0]).toHaveLength(4);
    // Check temporal order
    expect(new Date(combos[0][0].outbound.departure.time) < new Date(combos[0][1].outbound.departure.time)).toBe(true);
    expect(new Date(combos[0][1].outbound.departure.time) < new Date(combos[0][2].outbound.departure.time)).toBe(true);
    expect(new Date(combos[0][2].outbound.departure.time) < new Date(combos[0][3].outbound.departure.time)).toBe(true);
  });

  it('handles 5 legs correctly', () => {
    const legs = [
      [makeFlight({ departureTime: '2026-06-01T10:00:00.000Z', price: 100 })],
      [makeFlight({ departureTime: '2026-06-15T10:00:00.000Z', price: 120 })],
      [makeFlight({ departureTime: '2026-07-01T10:00:00.000Z', price: 130 })],
      [makeFlight({ departureTime: '2026-07-15T10:00:00.000Z', price: 110 })],
      [makeFlight({ departureTime: '2026-08-01T10:00:00.000Z', price: 140 })],
    ];
    const combos = buildCombos(legs);
    expect(combos).toHaveLength(1);
    expect(combos[0]).toHaveLength(5);
  });

  it('top-N truncation: 10 results per leg, maxCombos=100, 3 legs → topN=4 per leg', () => {
    // With topNPerLeg(100, 3)=4, we need to pass topN=4 to buildCombos
    const topN = topNPerLeg(100, 3);
    expect(topN).toBe(4);

    const makeLeg = (departureTime: string) =>
      Array.from({ length: 10 }, (_, i) => makeFlight({ departureTime, price: 100 + i }));

    const leg0 = makeLeg('2026-07-01T10:00:00.000Z');
    const leg1 = makeLeg('2026-07-15T10:00:00.000Z');
    const leg2 = makeLeg('2026-08-01T10:00:00.000Z');

    const combos = buildCombos([leg0, leg1, leg2], topN);
    // 4^3 = 64 combinations
    expect(combos).toHaveLength(64);
  });

  it('rejects combos where any leg is out of temporal order in 4-leg scenario', () => {
    const leg0 = [makeFlight({ departureTime: '2026-07-25T10:00:00.000Z', price: 200 })];
    const leg1 = [
      makeFlight({ departureTime: '2026-07-20T10:00:00.000Z', price: 150 }), // before leg0 → invalid
      makeFlight({ departureTime: '2026-08-10T10:00:00.000Z', price: 160 }), // valid
    ];
    const leg2 = [
      makeFlight({ departureTime: '2026-08-05T10:00:00.000Z', price: 200 }), // before valid leg1 → invalid
      makeFlight({ departureTime: '2026-09-01T10:00:00.000Z', price: 220 }), // valid
    ];
    const leg3 = [makeFlight({ departureTime: '2026-10-01T10:00:00.000Z', price: 180 })];

    const combos = buildCombos([leg0, leg1, leg2, leg3]);
    // Only 1 valid: leg0[0] + leg1[1] + leg2[1] + leg3[0]
    expect(combos).toHaveLength(1);
  });
});

describe('maxHours constraint', () => {
  it('rejects gaps longer than maxHours when set', () => {
    // leg1 arrives at 13:00, leg2 departs at 21:00 → 8h wait
    const leg1 = makeFlight({
      outbound: {
        departure: { airport: 'BUE', time: '2026-07-28T08:00:00.000Z' },
        arrival: { airport: 'CUZ', time: '2026-07-28T13:00:00.000Z' },
        airline: 'LATAM',
        flightNumber: 'N/A',
        durationMinutes: 0,
        stops: 0,
      },
    });
    const leg2 = makeFlight({
      outbound: {
        departure: { airport: 'CUZ', time: '2026-07-28T21:00:00.000Z' },
        arrival: { airport: 'LIM', time: '2026-07-28T23:00:00.000Z' },
        airline: 'LATAM',
        flightNumber: 'N/A',
        durationMinutes: 0,
        stops: 0,
      },
    });
    const combos = buildCombos([[leg1], [leg2]], {
      gapConstraints: [{ minDays: 0, maxDays: 1, maxHours: 5 }],
    });
    expect(combos).toHaveLength(0); // 8h > 5h, rejected
  });

  it('accepts gaps within maxHours', () => {
    // leg1 arrives at 13:00, leg2 departs at 16:00 → 3h wait
    const leg1 = makeFlight({
      outbound: {
        departure: { airport: 'BUE', time: '2026-07-28T08:00:00.000Z' },
        arrival: { airport: 'CUZ', time: '2026-07-28T13:00:00.000Z' },
        airline: 'LATAM',
        flightNumber: 'N/A',
        durationMinutes: 0,
        stops: 0,
      },
    });
    const leg2 = makeFlight({
      outbound: {
        departure: { airport: 'CUZ', time: '2026-07-28T16:00:00.000Z' },
        arrival: { airport: 'LIM', time: '2026-07-28T18:00:00.000Z' },
        airline: 'LATAM',
        flightNumber: 'N/A',
        durationMinutes: 0,
        stops: 0,
      },
    });
    const combos = buildCombos([[leg1], [leg2]], {
      gapConstraints: [{ minDays: 0, maxDays: 1, maxHours: 5 }],
    });
    expect(combos).toHaveLength(1);
  });

  it('still enforces minDays/maxDays when maxHours is also set', () => {
    // leg2 departs 4 days after leg1 → fails maxDays=1 even though maxHours=200 would allow it
    const leg1 = makeFlight({
      outbound: {
        departure: { airport: 'BUE', time: '2026-07-25T08:00:00.000Z' },
        arrival: { airport: 'CUZ', time: '2026-07-25T13:00:00.000Z' },
        airline: 'LATAM',
        flightNumber: 'N/A',
        durationMinutes: 0,
        stops: 0,
      },
    });
    const leg2 = makeFlight({
      outbound: {
        departure: { airport: 'CUZ', time: '2026-07-29T08:00:00.000Z' },
        arrival: { airport: 'LIM', time: '2026-07-29T10:00:00.000Z' },
        airline: 'LATAM',
        flightNumber: 'N/A',
        durationMinutes: 0,
        stops: 0,
      },
    });
    const combos = buildCombos([[leg1], [leg2]], {
      gapConstraints: [{ minDays: 0, maxDays: 1, maxHours: 200 }],
    });
    expect(combos).toHaveLength(0); // 4 days > maxDays=1
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
