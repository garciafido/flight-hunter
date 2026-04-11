import { describe, it, expect } from 'vitest';
import { DuffelSource } from '../../../src/sources/duffel.js';
import type { SearchConfig } from '@flight-hunter/shared';

const makeConfig = (): SearchConfig => ({
  id: 'search-1',
  name: 'Test',
  origin: 'BUE',
  departureFrom: new Date('2026-07-25'),
  departureTo: new Date('2026-07-25'),
  passengers: 1,
  filters: {
    airlineBlacklist: [],
    airlinePreferred: [],
    airportPreferred: {},
    airportBlacklist: {},
    maxUnplannedStops: 1,
    requireCarryOn: false,
    maxTotalTravelTime: 2000,
  },
  alertConfig: {
    scoreThresholds: { info: 60, good: 75, urgent: 90 },
    maxPricePerPerson: 600,
    currency: 'USD',
  },
  proxyRegions: ['CL'],
  scanIntervalMin: 15,
  active: true,
});

describe('DuffelSource', () => {
  it('has correct name', () => {
    const source = new DuffelSource('token-abc');
    expect(source.name).toBe('duffel');
  });

  it('search() returns [] (stubbed — not adapted to waypoint model)', async () => {
    const source = new DuffelSource('token-abc');
    const results = await source.search(makeConfig(), null);
    expect(results).toEqual([]);
  });
});
