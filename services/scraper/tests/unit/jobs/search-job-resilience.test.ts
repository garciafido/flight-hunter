import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchJobProcessor } from '../../../src/jobs/search-job.js';
import type { ResilienceLayer } from '../../../src/resilience/resilience-layer.js';
import type { SearchConfig, FlightResult } from '@flight-hunter/shared';
import { QUEUE_NAMES } from '@flight-hunter/shared';

const makeConfig = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
  id: 'search-r1',
  name: 'Resilience Test',
  origin: 'SCL',
  destination: 'MAD',
  departureFrom: new Date('2025-07-01'),
  departureTo: new Date('2025-07-15'),
  returnMinDays: 7,
  returnMaxDays: 14,
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
    minConnectionTime: 60,
    maxConnectionTime: 240,
    requireCarryOn: false,
    maxTotalTravelTime: 1440,
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
  source: 'kiwi',
  outbound: {
    departure: { airport: 'SCL', time: '2025-07-01T10:00:00' },
    arrival: { airport: 'MAD', time: '2025-07-01T22:00:00' },
    airline: 'LA',
    flightNumber: 'LA701',
    durationMinutes: 720,
    stops: 0,
  },
  inbound: {
    departure: { airport: 'MAD', time: '2025-07-15T08:00:00' },
    arrival: { airport: 'SCL', time: '2025-07-15T22:00:00' },
    airline: 'LA',
    flightNumber: 'LA702',
    durationMinutes: 840,
    stops: 0,
  },
  totalPrice: 1200,
  currency: 'USD',
  pricePer: 'total',
  passengers: 2,
  carryOnIncluded: true,
  bookingUrl: 'https://kiwi.com/booking',
  scrapedAt: new Date(),
  proxyRegion: 'CL',
  ...overrides,
});

describe('SearchJobProcessor — resilience wiring', () => {
  let source: { name: string; search: ReturnType<typeof vi.fn> };
  let vpnRouter: { getProxyUrl: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };
  let resilience: ResilienceLayer & { callSource: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    source = { name: 'kiwi', search: vi.fn().mockResolvedValue([makeResult()]) };
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
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
      resilience as never,
    );

    await processor.execute(makeConfig());

    expect(resilience.callSource).toHaveBeenCalledOnce();
    expect(resilience.callSource).toHaveBeenCalledWith('kiwi', false, expect.any(Function));
  });

  it('skips publishing when resilience layer returns skipped=true (open circuit)', async () => {
    resilience.callSource.mockResolvedValue({ result: null, skipped: true });

    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
      resilience as never,
    );

    await processor.execute(makeConfig());

    // Source function itself should NOT have been called — resilience skipped it
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('publishes results returned by the resilience layer', async () => {
    const result = makeResult({ source: 'kiwi' });
    resilience.callSource.mockResolvedValue({ result: [result], skipped: false });

    const processor = new SearchJobProcessor(
      [source as never],
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
      [source as never],
      vpnRouter as never,
      queue as never,
      resilience as never,
    );

    await processor.execute(makeConfig());

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('uses PassthroughResilienceLayer when none provided (backward compat)', async () => {
    source.search.mockResolvedValue([makeResult()]);

    // No resilience arg → PassthroughResilienceLayer
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeConfig());

    expect(source.search).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledOnce();
  });

  it('calls resilience layer for each leg in split mode', async () => {
    const oneWaySource = {
      name: 'google-flights',
      search: vi.fn(),
      searchOneWay: vi.fn().mockResolvedValue([]),
    };
    resilience.callSource.mockResolvedValue({ result: [], skipped: false });

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
      resilience as never,
    );

    const splitConfig = makeConfig({
      mode: 'split',
      legs: [
        { origin: 'SCL', destination: 'MAD', departureFrom: new Date('2025-07-01'), departureTo: new Date('2025-07-10') },
        { origin: 'MAD', destination: 'SCL', departureFrom: new Date('2025-07-15'), departureTo: new Date('2025-07-20') },
      ],
    });

    await processor.execute(splitConfig);

    // 2 legs → 2 resilience calls
    expect(resilience.callSource).toHaveBeenCalledTimes(2);
    expect(resilience.callSource).toHaveBeenCalledWith('google-flights', false, expect.any(Function));
  });

  it('skips leg when circuit open in split mode', async () => {
    const oneWaySource = {
      name: 'google-flights',
      search: vi.fn(),
      searchOneWay: vi.fn().mockResolvedValue([makeResult()]),
    };
    resilience.callSource.mockResolvedValue({ result: null, skipped: true });

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
      resilience as never,
    );

    const splitConfig = makeConfig({
      mode: 'split',
      legs: [
        { origin: 'SCL', destination: 'MAD', departureFrom: new Date('2025-07-01'), departureTo: new Date('2025-07-10') },
      ],
    });

    await processor.execute(splitConfig);

    expect(queue.add).not.toHaveBeenCalled();
  });
});
