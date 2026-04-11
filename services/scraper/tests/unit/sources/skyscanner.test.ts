import { describe, it, expect } from 'vitest';
import { SkyscannerSource } from '../../../src/sources/skyscanner.js';
import type { SearchConfig } from '@flight-hunter/shared';

const makeConfig = (): SearchConfig => ({
  id: 'search-1',
  name: 'Test',
  origin: 'SCL',
  departureFrom: new Date('2025-07-01'),
  departureTo: new Date('2025-07-15'),
  passengers: 2,
  proxyRegions: ['CL'],
  scanIntervalMin: 60,
  active: true,
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
});

describe('SkyscannerSource', () => {
  it('has correct name', () => {
    const source = new SkyscannerSource('key-abc');
    expect(source.name).toBe('skyscanner');
  });

  it('search() returns [] (stubbed — not adapted to waypoint model)', async () => {
    const source = new SkyscannerSource('key-abc');
    const results = await source.search(makeConfig(), null);
    expect(results).toEqual([]);
  });
});
