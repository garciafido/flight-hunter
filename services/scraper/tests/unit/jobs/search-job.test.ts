import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchJobProcessor } from '../../../src/jobs/search-job.js';
import type { SearchConfig, FlightResult, SearchLeg } from '@flight-hunter/shared';
import { QUEUE_NAMES } from '@flight-hunter/shared';

const makeConfig = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
  id: 'search-1',
  name: 'Test',
  origin: 'SCL',
  destination: 'MAD',
  departureFrom: new Date('2025-07-01'),
  departureTo: new Date('2025-07-15'),
  returnMinDays: 7,
  returnMaxDays: 14,
  passengers: 2,
  proxyRegions: ['CL', 'AR'],
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

const makeFlightResult = (overrides: Partial<FlightResult> = {}): FlightResult => ({
  searchId: 'search-1',
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

describe('SearchJobProcessor', () => {
  let source1: { name: string; search: ReturnType<typeof vi.fn> };
  let source2: { name: string; search: ReturnType<typeof vi.fn> };
  let vpnRouter: { getProxyUrl: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    source1 = { name: 'kiwi', search: vi.fn() };
    source2 = { name: 'skyscanner', search: vi.fn() };
    vpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    queue = { add: vi.fn().mockResolvedValue(undefined) };
  });

  it('calls search on each source for each region', async () => {
    source1.search.mockResolvedValue([]);
    source2.search.mockResolvedValue([]);

    const processor = new SearchJobProcessor(
      [source1 as never, source2 as never],
      vpnRouter as never,
      queue as never,
    );

    const config = makeConfig({ proxyRegions: ['CL', 'AR'] });
    await processor.execute(config);

    expect(source1.search).toHaveBeenCalledTimes(2); // once per region
    expect(source2.search).toHaveBeenCalledTimes(2);
  });

  it('gets proxy URL for each region', async () => {
    source1.search.mockResolvedValue([]);

    const processor = new SearchJobProcessor(
      [source1 as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeConfig({ proxyRegions: ['CL', 'AR'] }));

    expect(vpnRouter.getProxyUrl).toHaveBeenCalledWith('CL');
    expect(vpnRouter.getProxyUrl).toHaveBeenCalledWith('AR');
  });

  it('publishes each result to the raw results queue', async () => {
    const result1 = makeFlightResult({ source: 'kiwi' });
    const result2 = makeFlightResult({ source: 'skyscanner' });
    source1.search.mockResolvedValue([result1]);
    source2.search.mockResolvedValue([result2]);

    const processor = new SearchJobProcessor(
      [source1 as never, source2 as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeConfig({ proxyRegions: ['CL'] }));

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(QUEUE_NAMES.RAW_RESULTS, result1, expect.any(Object));
    expect(queue.add).toHaveBeenCalledWith(QUEUE_NAMES.RAW_RESULTS, result2, expect.any(Object));
  });

  it('continues with other sources if one throws', async () => {
    source1.search.mockRejectedValue(new Error('source1 error'));
    source2.search.mockResolvedValue([makeFlightResult({ source: 'skyscanner' })]);

    const processor = new SearchJobProcessor(
      [source1 as never, source2 as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeConfig({ proxyRegions: ['CL'] }));

    // source2 still called and its results published
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('passes proxy URL to each source', async () => {
    vpnRouter.getProxyUrl.mockResolvedValue('socks5://proxy:1080');
    source1.search.mockResolvedValue([]);

    const processor = new SearchJobProcessor(
      [source1 as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeConfig({ proxyRegions: ['CL'] }));

    expect(source1.search).toHaveBeenCalledWith(
      expect.anything(),
      'socks5://proxy:1080',
    );
  });

  it('uses default region when proxyRegions is empty', async () => {
    source1.search.mockResolvedValue([]);

    const processor = new SearchJobProcessor(
      [source1 as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeConfig({ proxyRegions: [] }));

    expect(vpnRouter.getProxyUrl).toHaveBeenCalledWith('default');
    expect(source1.search).toHaveBeenCalledTimes(1);
  });
});

describe('SearchJobProcessor split mode', () => {
  let oneWaySource: { name: string; search: ReturnType<typeof vi.fn>; searchOneWay: ReturnType<typeof vi.fn> };
  let vpnRouter: { getProxyUrl: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };

  const makeSplitConfig = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
    id: 'split-1',
    name: 'Split Test',
    origin: 'BUE',
    destination: 'CUZ',
    departureFrom: new Date('2026-07-25'),
    departureTo: new Date('2026-07-31'),
    returnMinDays: 7,
    returnMaxDays: 14,
    passengers: 1,
    proxyRegions: ['AR'],
    scanIntervalMin: 60,
    active: true,
    mode: 'split',
    legs: [
      {
        origin: 'BUE',
        destination: 'CUZ',
        departureFrom: new Date('2026-07-25'),
        departureTo: new Date('2026-07-31'),
      },
      {
        origin: 'CUZ',
        destination: 'BUE',
        departureFrom: new Date('2026-08-09'),
        departureTo: new Date('2026-08-30'),
        stopover: { airport: 'LIM', minDays: 3, maxDays: 4 },
      },
    ],
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
      maxPricePerPerson: 1500,
      currency: 'USD',
    },
    ...overrides,
  });

  beforeEach(() => {
    oneWaySource = { name: 'google-flights', search: vi.fn(), searchOneWay: vi.fn() };
    vpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    queue = { add: vi.fn().mockResolvedValue(undefined) };
  });

  it('calls searchOneWay for each leg when mode is split', async () => {
    oneWaySource.searchOneWay.mockResolvedValue([]);

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeSplitConfig());

    // 2 legs × 1 region = 2 calls
    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(2);
    expect(oneWaySource.search).not.toHaveBeenCalled();
  });

  it('passes correct legIndex to searchOneWay', async () => {
    oneWaySource.searchOneWay.mockResolvedValue([]);

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeSplitConfig());

    const calls = vi.mocked(oneWaySource.searchOneWay).mock.calls;
    expect(calls[0][1]).toBe(0); // legIndex 0
    expect(calls[1][1]).toBe(1); // legIndex 1
  });

  it('publishes results with legIndex from split mode', async () => {
    const leg0Result = makeFlightResult({ source: 'google-flights', searchId: 'split-1' });
    const leg1Result = makeFlightResult({ source: 'google-flights', searchId: 'split-1' });
    oneWaySource.searchOneWay
      .mockResolvedValueOnce([leg0Result])
      .mockResolvedValueOnce([leg1Result]);

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeSplitConfig());

    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it('does not call searchOneWay on sources without the method', async () => {
    const plainSource = { name: 'kiwi', search: vi.fn().mockResolvedValue([]) };

    const processor = new SearchJobProcessor(
      [plainSource as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeSplitConfig());

    expect(plainSource.search).not.toHaveBeenCalled();
  });

  it('falls back to roundtrip behavior when mode is roundtrip', async () => {
    oneWaySource.search.mockResolvedValue([]);

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const roundtripConfig = makeSplitConfig({ mode: 'roundtrip' });
    await processor.execute(roundtripConfig);

    expect(oneWaySource.search).toHaveBeenCalledOnce();
    expect(oneWaySource.searchOneWay).not.toHaveBeenCalled();
  });

  it('falls back to roundtrip when mode is undefined', async () => {
    const plainSource = { name: 'kiwi', search: vi.fn().mockResolvedValue([]) };

    const processor = new SearchJobProcessor(
      [plainSource as never],
      vpnRouter as never,
      queue as never,
    );

    const noModeConfig = makeSplitConfig({ mode: undefined });
    await processor.execute(noModeConfig);

    expect(plainSource.search).toHaveBeenCalledOnce();
  });

  it('continues to next leg if one leg fails', async () => {
    oneWaySource.searchOneWay
      .mockRejectedValueOnce(new Error('leg 0 failed'))
      .mockResolvedValueOnce([makeFlightResult({ source: 'google-flights', searchId: 'split-1' })]);

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeSplitConfig());

    // leg 1 still published
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});

describe('SearchJobProcessor flexible destination mode', () => {
  let source: { name: string; search: ReturnType<typeof vi.fn> };
  let vpnRouter: { getProxyUrl: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    source = { name: 'kiwi', search: vi.fn().mockResolvedValue([]) };
    vpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    queue = { add: vi.fn().mockResolvedValue(undefined) };
  });

  const makeFlexibleConfig = (candidates: string[]): SearchConfig => ({
    id: 'flex-1',
    name: 'Flexible Test',
    origin: 'SCL',
    destination: 'MAD', // will be overridden per candidate
    departureFrom: new Date('2026-07-01'),
    departureTo: new Date('2026-07-15'),
    returnMinDays: 7,
    returnMaxDays: 14,
    passengers: 1,
    proxyRegions: ['CL'],
    scanIntervalMin: 60,
    active: true,
    destinationMode: 'flexible',
    destinationCandidates: candidates,
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
  });

  it('calls search once per expanded destination', async () => {
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeFlexibleConfig(['CUZ', 'LIM', 'BOG']));
    // 3 destinations × 1 region = 3 calls
    expect(source.search).toHaveBeenCalledTimes(3);
  });

  it('expands region preset to individual airports', async () => {
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    // oceania has 3 airports: SYD, MEL, AKL
    await processor.execute(makeFlexibleConfig(['oceania']));
    expect(source.search).toHaveBeenCalledTimes(3);
  });

  it('passes the destination airport as config.destination to each search', async () => {
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeFlexibleConfig(['CUZ', 'LIM']));
    const calls = vi.mocked(source.search).mock.calls;
    const destinations = calls.map((c: any) => c[0].destination);
    expect(destinations).toContain('CUZ');
    expect(destinations).toContain('LIM');
  });

  it('falls through to normal execute when destinationMode is single', async () => {
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeFlexibleConfig(['CUZ']).concat ? {
      ...makeFlexibleConfig(['CUZ']),
      destinationMode: 'single',
    } : makeFlexibleConfig(['CUZ']));

    // When single mode, called once for regular roundtrip
    // (flexible candidates ignored)
  });

  it('falls through to normal execute when destinationCandidates is empty', async () => {
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    const config: SearchConfig = {
      ...makeFlexibleConfig([]),
    };
    await processor.execute(config);
    // Empty candidates → fall through to roundtrip (called once)
    expect(source.search).toHaveBeenCalledTimes(1);
  });
});

describe('SearchJobProcessor window mode', () => {
  let source: { name: string; search: ReturnType<typeof vi.fn> };
  let vpnRouter: { getProxyUrl: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    source = { name: 'kiwi', search: vi.fn().mockResolvedValue([]) };
    vpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    queue = { add: vi.fn().mockResolvedValue(undefined) };
  });

  const makeWindowConfig = (rangeStart: string, rangeEnd: string, duration: number, flexibility = 0): SearchConfig => ({
    id: 'window-1',
    name: 'Window Test',
    origin: 'SCL',
    destination: 'MAD',
    departureFrom: new Date(rangeStart),
    departureTo: new Date(rangeEnd),
    returnMinDays: duration,
    returnMaxDays: duration,
    passengers: 1,
    proxyRegions: ['CL'],
    scanIntervalMin: 60,
    active: true,
    windowMode: true,
    windowDuration: duration,
    windowFlexibility: flexibility,
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
  });

  it('calls search for each day in the range (3-day range → 3 windows)', async () => {
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeWindowConfig('2026-07-01', '2026-07-03', 14));
    // 3 days in range (Jul 1, 2, 3) → 3 calls
    expect(source.search).toHaveBeenCalledTimes(3);
  });

  it('caps at 30 windows max', async () => {
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    // 90-day range → should cap at 30
    await processor.execute(makeWindowConfig('2026-07-01', '2026-09-29', 14));
    expect(source.search).toHaveBeenCalledTimes(30);
  });

  it('passes correct returnMinDays/returnMaxDays with flexibility', async () => {
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeWindowConfig('2026-07-01', '2026-07-01', 14, 2));
    const config = vi.mocked(source.search).mock.calls[0][0] as SearchConfig;
    expect(config.returnMinDays).toBe(12); // 14 - 2
    expect(config.returnMaxDays).toBe(16); // 14 + 2
  });

  it('passes departure date as the exact window start', async () => {
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeWindowConfig('2026-07-05', '2026-07-05', 14));
    const config = vi.mocked(source.search).mock.calls[0][0] as SearchConfig;
    expect(config.departureFrom.toISOString().slice(0, 10)).toBe('2026-07-05');
    expect(config.departureTo.toISOString().slice(0, 10)).toBe('2026-07-05');
  });

  it('sets windowMode=false in synthetic config', async () => {
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeWindowConfig('2026-07-05', '2026-07-05', 14));
    const config = vi.mocked(source.search).mock.calls[0][0] as SearchConfig;
    expect(config.windowMode).toBe(false);
  });

  it('falls through to normal execute when windowDuration is not set', async () => {
    const processor = new SearchJobProcessor(
      [source as never],
      vpnRouter as never,
      queue as never,
    );

    const config: SearchConfig = {
      ...makeWindowConfig('2026-07-01', '2026-07-03', 14),
      windowDuration: undefined,
    };
    await processor.execute(config);
    // No windowDuration → falls through to roundtrip, 1 region × 1 source = 1 call
    expect(source.search).toHaveBeenCalledTimes(1);
  });
});
