import { describe, it, expect } from 'vitest';
import { AmadeusSource } from '../../../src/sources/amadeus.js';
import type { SearchConfig } from '@flight-hunter/shared';

const makeConfig = (): SearchConfig => ({
  id: 'search-1',
  name: 'Test',
  origin: 'BUE',
  departureFrom: new Date('2026-07-24'),
  departureTo: new Date('2026-07-25'),
  passengers: 2,
  filters: {
    airlineBlacklist: [],
    airlinePreferred: [],
    airportPreferred: {},
    airportBlacklist: {},
    maxUnplannedStops: 1,
    requireCarryOn: false,
    maxTotalTravelTime: 1440,
  },
  alertConfig: {
    scoreThresholds: { info: 60, good: 75, urgent: 90 },
    maxPricePerPerson: 2000,
    currency: 'USD',
  },
  proxyRegions: ['CL'],
  scanIntervalMin: 60,
  active: true,
});

describe('AmadeusSource', () => {
  it('has correct name', () => {
    const source = new AmadeusSource('key', 'secret');
    expect(source.name).toBe('amadeus');
  });

  it('search() returns [] (stubbed — not adapted to waypoint model)', async () => {
    const source = new AmadeusSource('key', 'secret');
    const results = await source.search(makeConfig(), null);
    expect(results).toEqual([]);
  });
});
