import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchJobProcessor } from '../../../src/jobs/search-job.js';
import type { SearchConfig, FlightResult, Waypoint } from '@flight-hunter/shared';
import { QUEUE_NAMES } from '@flight-hunter/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeStayWaypoint = (airport: string, minDays = 3, maxDays = 7): Waypoint => ({
  airport,
  gap: { type: 'stay', minDays, maxDays },
});

const makeConfig = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
  id: 'search-1',
  name: 'Test',
  origin: 'SCL',
  departureFrom: new Date('2026-07-01'),
  departureTo: new Date('2026-07-15'),
  passengers: 2,
  waypoints: [makeStayWaypoint('MAD')],
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
  source: 'google-flights',
  outbound: {
    departure: { airport: 'SCL', time: '2026-07-01T10:00:00' },
    arrival: { airport: 'MAD', time: '2026-07-01T22:00:00' },
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

// ---------------------------------------------------------------------------
// SearchJobProcessor waypoint dispatch
// ---------------------------------------------------------------------------

describe('SearchJobProcessor waypoint dispatch', () => {
  let oneWaySource: { name: string; searchOneWay: ReturnType<typeof vi.fn> };
  let vpnRouter: { getProxyUrl: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    oneWaySource = { name: 'google-flights', searchOneWay: vi.fn().mockResolvedValue([]) };
    vpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    queue = { add: vi.fn().mockResolvedValue(undefined) };
  });

  it('calls searchOneWay for each unique pair from a 1-waypoint search (2 pairs)', async () => {
    // origin=SCL, waypoints=[MAD] → SCL→MAD, MAD→SCL = 2 unique pairs
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config = makeConfig({ origin: 'SCL', waypoints: [makeStayWaypoint('MAD')], proxyRegions: ['CL'] });
    await processor.execute(config);

    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(2);
    const calledPairs = vi.mocked(oneWaySource.searchOneWay).mock.calls.map((c: any) => ({
      origin: c[1].origin,
      destination: c[1].destination,
    }));
    expect(calledPairs).toContainEqual({ origin: 'SCL', destination: 'MAD' });
    expect(calledPairs).toContainEqual({ origin: 'MAD', destination: 'SCL' });
  });

  it('calls searchOneWay for each pair in the single sequence for a 2-waypoint search (3 pairs)', async () => {
    // origin=BUE, waypoints=[LIM, CUZ] → no permutations → 1 sequence BUE→LIM→CUZ→BUE → 3 pairs
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config = makeConfig({
      origin: 'BUE',
      waypoints: [makeStayWaypoint('LIM'), makeStayWaypoint('CUZ')],
      proxyRegions: ['AR'],
    });
    await processor.execute(config);

    // 3 pairs × 1 region × 1 source = 3 calls
    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(3);
    const calledPairs = vi.mocked(oneWaySource.searchOneWay).mock.calls.map((c: any) => ({
      origin: c[1].origin,
      destination: c[1].destination,
    }));
    // The 3 pairs from the single sequence BUE→LIM→CUZ→BUE
    expect(calledPairs).toContainEqual({ origin: 'BUE', destination: 'LIM' });
    expect(calledPairs).toContainEqual({ origin: 'LIM', destination: 'CUZ' });
    expect(calledPairs).toContainEqual({ origin: 'CUZ', destination: 'BUE' });
  });

  it('iterates over all proxy regions', async () => {
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    // 2 pairs × 2 regions = 4 calls
    const config = makeConfig({ origin: 'SCL', waypoints: [makeStayWaypoint('MAD')], proxyRegions: ['CL', 'AR'] });
    await processor.execute(config);

    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(4);
    expect(vpnRouter.getProxyUrl).toHaveBeenCalledWith('CL');
    expect(vpnRouter.getProxyUrl).toHaveBeenCalledWith('AR');
  });

  it('uses default region when proxyRegions is empty', async () => {
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config = makeConfig({ proxyRegions: [] });
    await processor.execute(config);

    expect(vpnRouter.getProxyUrl).toHaveBeenCalledWith('default');
  });

  it('publishes each result to the raw results queue', async () => {
    const result1 = makeFlightResult({ source: 'google-flights' });
    const result2 = makeFlightResult({ source: 'google-flights' });
    oneWaySource.searchOneWay
      .mockResolvedValueOnce([result1])
      .mockResolvedValueOnce([result2])
      .mockResolvedValue([]);

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config = makeConfig({ proxyRegions: ['CL'] });
    await processor.execute(config);

    expect(queue.add).toHaveBeenCalledWith(QUEUE_NAMES.RAW_RESULTS, result1, expect.any(Object));
    expect(queue.add).toHaveBeenCalledWith(QUEUE_NAMES.RAW_RESULTS, result2, expect.any(Object));
  });

  it('skips sources without searchOneWay', async () => {
    const plainSource = { name: 'kiwi', search: vi.fn().mockResolvedValue([]) };

    const processor = new SearchJobProcessor(
      [plainSource as never],
      vpnRouter as never,
      queue as never,
    );

    const config = makeConfig({ proxyRegions: ['CL'] });
    await processor.execute(config);

    // plain source has no searchOneWay, so search is never called either
    expect(plainSource.search).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('continues with other pairs if resilience layer marks one as skipped', async () => {
    // Simulate the resilience layer returning skipped=true for the first call
    const { PassthroughResilienceLayer } = await import(
      '../../../src/resilience/resilience-layer.js'
    );
    let callCount = 0;
    const mockResilience = {
      callSource: vi.fn(async (_name: string, _open: boolean, fn: () => Promise<any>) => {
        callCount++;
        if (callCount === 1) return { result: undefined, skipped: true };
        return { result: await fn(), skipped: false };
      }),
    };

    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
      mockResilience as never,
    );

    oneWaySource.searchOneWay.mockResolvedValue([makeFlightResult()]);
    const config = makeConfig({ origin: 'SCL', waypoints: [makeStayWaypoint('MAD')], proxyRegions: ['CL'] });
    await processor.execute(config);

    // First pair skipped, second pair published → 1 result
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('skips and warns when there are no waypoints', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config = makeConfig({ waypoints: [] });
    await processor.execute(config);

    expect(oneWaySource.searchOneWay).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no waypoints'));
    warnSpy.mockRestore();
  });

});

// ---------------------------------------------------------------------------
// SearchJobProcessor flexible destination mode
// ---------------------------------------------------------------------------

describe('SearchJobProcessor flexible destination mode', () => {
  let oneWaySource: { name: string; searchOneWay: ReturnType<typeof vi.fn> };
  let vpnRouter: { getProxyUrl: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    oneWaySource = { name: 'google-flights', searchOneWay: vi.fn().mockResolvedValue([]) };
    vpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    queue = { add: vi.fn().mockResolvedValue(undefined) };
  });

  const makeFlexibleConfig = (candidates: string[], waypoints?: Waypoint[]): SearchConfig => ({
    ...makeConfig({
      origin: 'SCL',
      waypoints: waypoints ?? [makeStayWaypoint('LIM'), makeStayWaypoint('CUZ')],
      proxyRegions: ['CL'],
      destinationMode: 'flexible',
      destinationCandidates: candidates,
    }),
  });

  it('substitutes last waypoint for each candidate and calls searchOneWay', async () => {
    // config: origin=SCL, waypoints=[LIM, CUZ], candidates=[BOG, UIO]
    // Sub-search 1: waypoints=[LIM, BOG] → 3 pairs (no permutations)
    // Sub-search 2: waypoints=[LIM, UIO] → 3 pairs (no permutations)
    // total: 6 searchOneWay calls (3 per candidate × 1 region)
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeFlexibleConfig(['BOG', 'UIO']));

    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(6);
  });

  it('uses the correct airport in the last waypoint for each sub-search', async () => {
    // 1 waypoint [CUZ], candidates=[BOG, UIO]
    // Sub-search 1: waypoints=[BOG] → pairs: SCL→BOG, BOG→SCL
    // Sub-search 2: waypoints=[UIO] → pairs: SCL→UIO, UIO→SCL
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config = makeFlexibleConfig(['BOG', 'UIO'], [makeStayWaypoint('CUZ')]);
    await processor.execute(config);

    const calledPairs = vi.mocked(oneWaySource.searchOneWay).mock.calls.map((c: any) => ({
      origin: c[1].origin,
      destination: c[1].destination,
    }));
    expect(calledPairs).toContainEqual({ origin: 'SCL', destination: 'BOG' });
    expect(calledPairs).toContainEqual({ origin: 'BOG', destination: 'SCL' });
    expect(calledPairs).toContainEqual({ origin: 'SCL', destination: 'UIO' });
    expect(calledPairs).toContainEqual({ origin: 'UIO', destination: 'SCL' });
    // Original CUZ should not appear
    expect(calledPairs).not.toContainEqual(expect.objectContaining({ destination: 'CUZ' }));
  });

  it('expands region preset to individual airports', async () => {
    // 'oceania' expands to SYD, MEL, AKL (3 airports)
    // each gets a 1-waypoint sub-search (2 pairs per) → 6 total
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config = makeFlexibleConfig(['oceania'], [makeStayWaypoint('CUZ')]);
    await processor.execute(config);

    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(6); // 3 airports × 2 pairs
  });

  it('falls through to plain executeWaypoints when destinationMode is single', async () => {
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config: SearchConfig = {
      ...makeFlexibleConfig(['BOG', 'UIO']),
      destinationMode: 'single',
    };
    await processor.execute(config);

    // Single mode: config has 2 waypoints [LIM, CUZ], no permutations
    // → 3 pairs from the single sequence SCL→LIM→CUZ→SCL
    // destinationCandidates are ignored
    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(3);
  });

  it('falls through to plain executeWaypoints when destinationCandidates is empty', async () => {
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config: SearchConfig = {
      ...makeFlexibleConfig([]),
      destinationMode: 'flexible',
      destinationCandidates: [],
    };
    await processor.execute(config);

    // Empty candidates → falls through to executeWaypoints with [LIM, CUZ]
    // → 3 pairs from the single sequence (no permutations)
    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(3);
  });

  it('skips and warns when flexible config has no waypoints', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config: SearchConfig = {
      ...makeFlexibleConfig(['BOG']),
      waypoints: [],
    };
    await processor.execute(config);

    expect(oneWaySource.searchOneWay).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no waypoints'));
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// SearchJobProcessor window mode
// ---------------------------------------------------------------------------

describe('SearchJobProcessor window mode', () => {
  let oneWaySource: { name: string; searchOneWay: ReturnType<typeof vi.fn> };
  let vpnRouter: { getProxyUrl: ReturnType<typeof vi.fn> };
  let queue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    oneWaySource = { name: 'google-flights', searchOneWay: vi.fn().mockResolvedValue([]) };
    vpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    queue = { add: vi.fn().mockResolvedValue(undefined) };
  });

  const makeWindowConfig = (rangeStart: string, rangeEnd: string, duration = 14): SearchConfig => ({
    ...makeConfig({
      origin: 'SCL',
      waypoints: [makeStayWaypoint('MAD')],
      departureFrom: new Date(rangeStart),
      departureTo: new Date(rangeEnd),
      proxyRegions: ['CL'],
      windowMode: true,
      windowDuration: duration,
    }),
  });

  it('iterates once per day in range (3-day range → 3 windows)', async () => {
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    // 3 days × 2 pairs per 1-waypoint = 6 searchOneWay calls
    await processor.execute(makeWindowConfig('2026-07-25', '2026-07-27'));

    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(6);
  });

  it('each window synthetic config has departureFrom === departureTo === window date', async () => {
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeWindowConfig('2026-07-25', '2026-07-27'));

    // Each searchOneWay receives the config with departureFrom = departureTo
    const configs = vi.mocked(oneWaySource.searchOneWay).mock.calls.map((c: any) => c[0] as SearchConfig);
    // Get unique departure dates used
    const dates = [...new Set(configs.map((c) => c.departureFrom.toISOString().slice(0, 10)))];
    expect(dates.sort()).toEqual(['2026-07-25', '2026-07-26', '2026-07-27']);

    // Each config has departureFrom === departureTo
    for (const cfg of configs) {
      expect(cfg.departureFrom.toISOString().slice(0, 10)).toBe(
        cfg.departureTo.toISOString().slice(0, 10),
      );
    }
  });

  it('caps at 30 windows max', async () => {
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    // 90-day range → capped at 30 windows × 2 pairs = 60 calls
    await processor.execute(makeWindowConfig('2026-07-01', '2026-09-29'));

    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(60);
  });

  it('sets windowMode=false in each synthetic config', async () => {
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    await processor.execute(makeWindowConfig('2026-07-25', '2026-07-25'));

    const configs = vi.mocked(oneWaySource.searchOneWay).mock.calls.map((c: any) => c[0] as SearchConfig);
    for (const cfg of configs) {
      expect(cfg.windowMode).toBe(false);
    }
  });

  it('falls through to executeWaypoints when windowMode is false', async () => {
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config: SearchConfig = {
      ...makeWindowConfig('2026-07-25', '2026-07-27'),
      windowMode: false,
    };
    await processor.execute(config);

    // Falls through to single executeWaypoints call: 2 pairs
    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(2);
  });

  it('falls through to executeWaypoints when windowDuration is undefined', async () => {
    const processor = new SearchJobProcessor(
      [oneWaySource as never],
      vpnRouter as never,
      queue as never,
    );

    const config: SearchConfig = {
      ...makeWindowConfig('2026-07-25', '2026-07-27'),
      windowDuration: undefined,
    };
    await processor.execute(config);

    // No windowDuration → falls through: 2 pairs
    expect(oneWaySource.searchOneWay).toHaveBeenCalledTimes(2);
  });
});
