import { describe, it, expect, vi } from 'vitest';
import { SearchJobProcessor } from '../../src/jobs/search-job.js';
import { QUEUE_NAMES } from '@flight-hunter/shared';
import type { SearchConfig } from '@flight-hunter/shared';

const makeE2eConfig = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
  id: 'e2e-search',
  name: 'E2E Search',
  origin: 'AEP',
  departureFrom: new Date('2026-07-24'),
  departureTo: new Date('2026-07-31'),
  passengers: 2,
  waypoints: [{ airport: 'CUZ', gap: { type: 'stay', minDays: 7, maxDays: 14 } }],
  maxConnectionHours: 24,
  proxyRegions: ['CL', 'AR'],
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
  alertConfig: { scoreThresholds: { info: 60, good: 75, urgent: 90 }, maxPricePerPerson: 600, currency: 'USD' },
  ...overrides,
});

const makeE2eResult = () => ({
  searchId: 'e2e-search',
  source: 'google-flights' as const,
  outbound: {
    departure: { airport: 'AEP', time: '2026-07-24T10:00:00Z' },
    arrival: { airport: 'CUZ', time: '2026-07-24T15:00:00Z' },
    airline: 'LATAM',
    flightNumber: 'LA1234',
    durationMinutes: 300,
    stops: 0,
  },
  inbound: null,
  totalPrice: 350,
  currency: 'USD',
  pricePer: 'person' as const,
  passengers: 2,
  carryOnIncluded: true,
  bookingUrl: 'https://example.com',
  scrapedAt: new Date(),
  proxyRegion: 'CL' as const,
});

describe('Scraper E2E Flow', () => {
  it('processes a search config through sources and publishes to queue', async () => {
    const publishedResults: any[] = [];

    // source with searchOneWay — returns 1 result per call
    const mockSource = {
      name: 'mock-source',
      searchOneWay: vi.fn().mockResolvedValue([makeE2eResult()]),
    };

    const mockVpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    const mockQueue = {
      add: vi.fn().mockImplementation(async (_name: string, data: any) => {
        publishedResults.push(data);
        return { id: `job-${publishedResults.length}` };
      }),
    };

    const processor = new SearchJobProcessor(
      [mockSource as any],
      mockVpnRouter as any,
      mockQueue as any,
    );

    // 1-waypoint [CUZ] → 2 unique pairs × 2 regions = 4 searchOneWay calls → 4 results
    await processor.execute(makeE2eConfig({ proxyRegions: ['CL', 'AR'] }));

    expect(publishedResults.length).toBe(4); // 2 pairs × 2 regions
    expect(publishedResults[0].searchId).toBe('e2e-search');
    expect(mockSource.searchOneWay).toHaveBeenCalledTimes(4);
    expect(mockVpnRouter.getProxyUrl).toHaveBeenCalledWith('CL');
    expect(mockVpnRouter.getProxyUrl).toHaveBeenCalledWith('AR');

    // Verify queue was called with the correct queue name
    expect(mockQueue.add).toHaveBeenCalledWith(QUEUE_NAMES.RAW_RESULTS, expect.any(Object), expect.any(Object));
  });

  it('continues when a source fails (no searchOneWay) and another succeeds', async () => {
    const publishedResults: any[] = [];

    // failSource has no searchOneWay → filtered out
    const failSource = {
      name: 'fail-source',
      search: vi.fn().mockRejectedValue(new Error('API down')),
    };
    // goodSource has searchOneWay → used
    const goodSource = {
      name: 'good-source',
      searchOneWay: vi.fn().mockResolvedValue([makeE2eResult()]),
    };

    const mockVpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    const mockQueue = {
      add: vi.fn().mockImplementation(async (_: string, data: any) => {
        publishedResults.push(data);
        return { id: '1' };
      }),
    };

    const processor = new SearchJobProcessor(
      [failSource as any, goodSource as any],
      mockVpnRouter as any,
      mockQueue as any,
    );

    // 1-waypoint [CUZ] → 2 pairs × 1 region = 2 calls on goodSource
    await processor.execute(makeE2eConfig({ proxyRegions: ['CL'] }));

    expect(publishedResults.length).toBe(2);
    expect(goodSource.searchOneWay).toHaveBeenCalled();
    // failSource has no searchOneWay so its search is never called
    expect(failSource.search).not.toHaveBeenCalled();
  });

  it('uses default region when proxyRegions is empty', async () => {
    const publishedResults: any[] = [];

    const mockSource = {
      name: 'mock-source',
      searchOneWay: vi.fn().mockResolvedValue([makeE2eResult()]),
    };

    const mockVpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    const mockQueue = {
      add: vi.fn().mockImplementation(async (_: string, data: any) => {
        publishedResults.push(data);
        return { id: '1' };
      }),
    };

    const processor = new SearchJobProcessor(
      [mockSource as any],
      mockVpnRouter as any,
      mockQueue as any,
    );

    // 1-waypoint [CUZ], empty proxyRegions → ['default'] → 2 pairs × 1 region = 2 results
    await processor.execute(makeE2eConfig({ proxyRegions: [] }));

    expect(publishedResults.length).toBe(2); // 2 pairs × 1 default region
    expect(mockVpnRouter.getProxyUrl).toHaveBeenCalledWith('default');
  });
});
