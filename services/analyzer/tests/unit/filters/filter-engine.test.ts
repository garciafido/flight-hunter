import { describe, it, expect } from 'vitest';
import { FilterEngine } from '../../../src/filters/filter-engine.js';
import type { FlightResult, SearchFilters } from '@flight-hunter/shared';

function makeFilters(overrides: Partial<SearchFilters> = {}): SearchFilters {
  return {
    airlineBlacklist: [],
    airlinePreferred: [],
    airportPreferred: {},
    airportBlacklist: {},
    maxUnplannedStops: 2,
    minConnectionTime: 60,
    maxConnectionTime: 480,
    requireCarryOn: false,
    maxTotalTravelTime: 1440,
    ...overrides,
  };
}

function makeFlight(overrides: Partial<FlightResult> = {}): FlightResult {
  return {
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
    scrapedAt: new Date(),
    proxyRegion: 'CL',
    ...overrides,
  };
}

describe('FilterEngine', () => {
  const engine = new FilterEngine();

  it('passes a valid flight', () => {
    const result = engine.apply(makeFlight(), makeFilters());
    expect(result.passed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  describe('airline blacklist', () => {
    it('rejects flight with blacklisted outbound airline', () => {
      const result = engine.apply(
        makeFlight(),
        makeFilters({ airlineBlacklist: ['LA'] }),
      );
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('LA');
      expect(result.reason).toContain('blacklisted');
    });

    it('rejects flight with blacklisted inbound airline', () => {
      const flight = makeFlight({
        inbound: {
          departure: { airport: 'MIA', time: '09:00' },
          arrival: { airport: 'SCL', time: '17:00' },
          airline: 'Ryanair',
          flightNumber: 'FR123',
          durationMinutes: 480,
          stops: 0,
        },
      });
      const result = engine.apply(flight, makeFilters({ airlineBlacklist: ['Ryanair'] }));
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Ryanair');
    });
  });

  describe('airport blacklist', () => {
    // Use a flight with 4 distinct airports to precisely test each check
    function makeDistinctAirportFlight(): FlightResult {
      return makeFlight({
        outbound: {
          departure: { airport: 'A001', time: '10:00' },
          arrival: { airport: 'A002', time: '18:00' },
          airline: 'LA',
          flightNumber: 'LA800',
          durationMinutes: 480,
          stops: 0,
        },
        inbound: {
          departure: { airport: 'A003', time: '09:00' },
          arrival: { airport: 'A004', time: '17:00' },
          airline: 'LA',
          flightNumber: 'LA801',
          durationMinutes: 480,
          stops: 0,
        },
      });
    }

    it('rejects flight departing from blacklisted outbound departure airport', () => {
      const result = engine.apply(
        makeDistinctAirportFlight(),
        makeFilters({ airportBlacklist: { list: ['A001'] } }),
      );
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('A001');
    });

    it('rejects flight arriving at blacklisted outbound arrival airport', () => {
      const result = engine.apply(
        makeDistinctAirportFlight(),
        makeFilters({ airportBlacklist: { list: ['A002'] } }),
      );
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('A002');
    });

    it('rejects flight with blacklisted inbound departure airport', () => {
      const result = engine.apply(
        makeDistinctAirportFlight(),
        makeFilters({ airportBlacklist: { list: ['A003'] } }),
      );
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('A003');
    });

    it('rejects flight with blacklisted inbound arrival airport', () => {
      const result = engine.apply(
        makeDistinctAirportFlight(),
        makeFilters({ airportBlacklist: { list: ['A004'] } }),
      );
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('A004');
    });
  });

  describe('carry-on requirement', () => {
    it('rejects flight without carry-on when required', () => {
      const flight = makeFlight({ carryOnIncluded: false });
      const result = engine.apply(flight, makeFilters({ requireCarryOn: true }));
      expect(result.passed).toBe(false);
      expect(result.reason?.toLowerCase()).toContain('carry-on');
    });

    it('passes flight with carry-on when required', () => {
      const result = engine.apply(
        makeFlight({ carryOnIncluded: true }),
        makeFilters({ requireCarryOn: true }),
      );
      expect(result.passed).toBe(true);
    });

    it('passes flight without carry-on when not required', () => {
      const result = engine.apply(
        makeFlight({ carryOnIncluded: false }),
        makeFilters({ requireCarryOn: false }),
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('max total travel time', () => {
    it('rejects one-way flight exceeding max travel time (filter is in hours)', () => {
      // outbound=480min (8h). Max 7h = 420min → reject
      const result = engine.apply(makeFlight(), makeFilters({ maxTotalTravelTime: 7 }));
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('480');
      expect(result.reason).toContain('420');
    });

    it('passes flight within max travel time', () => {
      // outbound=480min (8h), max 9h = 540min → pass
      const result = engine.apply(makeFlight(), makeFilters({ maxTotalTravelTime: 9 }));
      expect(result.passed).toBe(true);
    });

    it('passes flight exactly at max travel time', () => {
      // 480min = 8h
      const result = engine.apply(makeFlight(), makeFilters({ maxTotalTravelTime: 8 }));
      expect(result.passed).toBe(true);
    });

    it('passes flight when max travel time is 0 (unlimited)', () => {
      const result = engine.apply(makeFlight(), makeFilters({ maxTotalTravelTime: 0 }));
      expect(result.passed).toBe(true);
    });

    it('passes flight when source returns 0 duration (cannot enforce)', () => {
      const flight = makeFlight({
        outbound: { ...makeFlight().outbound, durationMinutes: 0 },
      });
      const result = engine.apply(flight, makeFilters({ maxTotalTravelTime: 5 }));
      expect(result.passed).toBe(true);
    });
  });

  describe('max layover (maxConnectionHours)', () => {
    it('rejects a 1-stop flight whose duration implies excessive layover', () => {
      // 1 stop, 840min (14h). maxConnectionHours=6 → max total = (1+1)*6*60 = 720min. 840 > 720 → reject
      const flight = makeFlight({
        outbound: { ...makeFlight().outbound, stops: 1, durationMinutes: 840 },
      });
      const result = engine.apply(flight, makeFilters(), { maxConnectionHours: 6 });
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('840');
    });

    it('accepts a 1-stop flight within reasonable layover', () => {
      // 1 stop, 600min (10h). maxConnectionHours=6 → max = 720min. 600 < 720 → pass
      const flight = makeFlight({
        outbound: { ...makeFlight().outbound, stops: 1, durationMinutes: 600 },
      });
      const result = engine.apply(flight, makeFilters(), { maxConnectionHours: 6 });
      expect(result.passed).toBe(true);
    });

    it('does not apply to nonstop flights', () => {
      const flight = makeFlight({
        outbound: { ...makeFlight().outbound, stops: 0, durationMinutes: 1000 },
      });
      const result = engine.apply(flight, makeFilters(), { maxConnectionHours: 6 });
      expect(result.passed).toBe(true);
    });
  });

  describe('max unplanned stops', () => {
    it('rejects outbound flight with too many stops', () => {
      const flight = makeFlight({
        outbound: {
          ...makeFlight().outbound,
          stops: 3,
        },
      });
      const result = engine.apply(flight, makeFilters({ maxUnplannedStops: 2 }));
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('3');
      expect(result.reason).toContain('2');
    });

    it('passes flight with acceptable stops', () => {
      const flight = makeFlight({
        outbound: { ...makeFlight().outbound, stops: 1 },
      });
      const result = engine.apply(flight, makeFilters({ maxUnplannedStops: 2 }));
      expect(result.passed).toBe(true);
    });
  });
});
