import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchJobProcessor } from '../../../src/jobs/search-job.js';
import type { ResilienceLayer } from '../../../src/resilience/resilience-layer.js';
import type { SearchConfig, FlightResult } from '@flight-hunter/shared';
import { QUEUE_NAMES } from '@flight-hunter/shared';

const makeConfig = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
  id: 'search-r1',
  name: 'Resilience Test',
  origin: 'SCL',
  departureFrom: new Date('2025-07-01'),
  departureTo: new Date('2025-07-15'),
  passengers: 2,
  waypoints: [{ airport: 'MAD', gap: { type: 'stay', minDays: 7, maxDays: 14 } }],
  maxConnectionHours: 24,
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
  },
  alertConfig: {
    scoreThresholds: { info: 60, good: 75, urgent: 90 },
    maxPricePerPerson: 2000,
    currency: 'USD',
  },
  ...overrides,
});

const makeResult = (overrides: Partial<FlightResult> = {}): FlightResult => ({
  searchId: 'search-r1',
  source: 'google-flights',
  outbound: {
    departure: { airport: 'SCL', time: '2025-07-01T10:00:00' },
    arrival: { airport: 'MAD', time: '2025-07-01T22:00:00' },
    airline: 'LA',
    flightNumber: 'LA701',
    durationMinutes: 720,
    stops: 0,
  },
  inbound: null,
  totalPrice: 1200,
  currency: 'USD',
  pricePer: 'total',
  passengers: 2,
  carryOnIncluded: true,
  bookingUrl: 'https://google.com/flights',
  scrapedAt: new Date(),
  proxyRegion: 'CL',
  ...overrides,
});

describe('SearchJobProcessor — resilience wiring', () => {
  let oneWaySource: { name: string; searchOneWay: ReturnType<typeof vi.fn> };
  let vpnRouter: { getProxyUrl: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };
  let resilience: ResilienceLayer & { callSource: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    oneWaySource = { name: 'google-flights', searchOneWay: vi.fn().mockResolvedValue([makeResult()]) };
    vpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    queue = { add: vi.fn().mockResolvedValue(undefined) };
    resilience = {
      callSource: vi.fn().mockImplementation(async (_name, _hasKey, fn) => {
        const result = await fn();
        return { result, skipped: false };
      }),
    };
  });

  it('delegates each source call through the resilience layer', async () => {
    // 1-waypoint [MAD] → 2 unique pairs (SCL→MAD, MAD→SCL) → 2 resilience calls
    resilience.callSource.mockResolvedValue({ result: [], skipped: false });

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
      resilience as never,
    );

    await processor.execute(makeConfig());

    expect(resilience.callSource).toHaveBeenCalledTimes(2);
    expect(resilience.callSource).toHaveBeenCalledWith('google-flights', false, expect.any(Function));
  });

  it('skips publishing when resilience layer returns skipped=true (open circuit)', async () => {
    resilience.callSource.mockResolvedValue({ result: null, skipped: true });

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
      resilience as never,
    );

    await processor.execute(makeConfig());

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('publishes results returned by the resilience layer', async () => {
    const result = makeResult({ source: 'google-flights' });
    // Return results for first pair only, empty for the second
    resilience.callSource
      .mockResolvedValueOnce({ result: [result], skipped: false })
      .mockResolvedValue({ result: [], skipped: false });

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
      resilience as never,
    );

    await processor.execute(makeConfig());

    expect(queue.add).toHaveBeenCalledWith(QUEUE_NAMES.RAW_RESULTS, result, expect.any(Object));
  });

  it('handles null result from resilience gracefully (error path)', async () => {
    resilience.callSource.mockResolvedValue({ result: null, skipped: false });

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
      resilience as never,
    );

    await processor.execute(makeConfig());

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('uses PassthroughResilienceLayer when none provided (backward compat)', async () => {
    const result = makeResult();
    oneWaySource.searchOneWay
      .mockResolvedValueOnce([result])
      .mockResolvedValue([]);

    // No resilience arg → PassthroughResilienceLayer
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeConfig());

    // searchOneWay called for 2 pairs; first call yields 1 result
    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledOnce();
  });

  it('calls resilience layer for each unique waypoint pair', async () => {
    // 2-waypoint [LIM, CUZ] → no permutations → 3 pairs → 3 resilience calls
    resilience.callSource.mockResolvedValue({ result: [], skipped: false });

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
      resilience as never,
    );

    const config = makeConfig({
      waypoints: [
        { airport: 'LIM', gap: { type: 'stay', minDays: 3, maxDays: 5 } },
        { airport: 'CUZ', gap: { type: 'stay', minDays: 3, maxDays: 5 } },
      ],
    });

    await processor.execute(config);

    expect(resilience.callSource).toHaveBeenCalledTimes(3);
    expect(resilience.callSource).toHaveBeenCalledWith('google-flights', false, expect.any(Function));
  });

  it('skips pair when circuit open in waypoint mode', async () => {
    resilience.callSource.mockResolvedValue({ result: null, skipped: true });

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
      resilience as never,
    );

    await processor.execute(makeConfig());

    expect(queue.add).not.toHaveBeenCalled();
  });
});
