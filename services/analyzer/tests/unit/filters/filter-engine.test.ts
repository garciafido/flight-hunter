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
    it('rejects flight exceeding max travel time (filter is in hours)', () => {
      // outbound=480min + inbound=480min = 960min total. Max 13h = 780min < 960min → reject
      const result = engine.apply(makeFlight(), makeFilters({ maxTotalTravelTime: 13 }));
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('960');
      expect(result.reason).toContain('780');
    });

    it('passes flight within max travel time', () => {
      // 960min total, max 17h = 1020min → pass
      const result = engine.apply(makeFlight(), makeFilters({ maxTotalTravelTime: 17 }));
      expect(result.passed).toBe(true);
    });

    it('passes flight exactly at max travel time', () => {
      // 960min = 16h
      const result = engine.apply(makeFlight(), makeFilters({ maxTotalTravelTime: 16 }));
      expect(result.passed).toBe(true);
    });

    it('passes flight when max travel time is 0 (unlimited)', () => {
      const result = engine.apply(makeFlight(), makeFilters({ maxTotalTravelTime: 0 }));
      expect(result.passed).toBe(true);
    });

    it('passes flight when source returns 0 duration (cannot enforce)', () => {
      const flight = makeFlight({
        outbound: { ...makeFlight().outbound, durationMinutes: 0 },
        inbound: { ...makeFlight().inbound, durationMinutes: 0 },
      });
      const result = engine.apply(flight, makeFilters({ maxTotalTravelTime: 5 }));
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

    it('rejects inbound flight with too many stops', () => {
      const flight = makeFlight({
        inbound: {
          ...makeFlight().inbound,
          stops: 3,
        },
      });
      const result = engine.apply(flight, makeFilters({ maxUnplannedStops: 2 }));
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('3');
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
