import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KiwiSource } from '../../../src/sources/kiwi.js';
import type { SearchConfig } from '@flight-hunter/shared';
import { injectCache, resetCache } from '../../../src/utils/exchange-rates.js';

const makeConfig = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
  id: 'search-1',
  name: 'Test Search',
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

const makeKiwiApiResponse = () => ({
  data: [
    {
      id: 'kiwi-1',
      flyFrom: 'SCL',
      flyTo: 'MAD',
      local_departure: '2025-07-01T10:00:00',
      local_arrival: '2025-07-01T22:00:00',
      price: 1200,
      currency: 'USD',
      fare: { adults: 1200 },
      bags_price: { hand: 0 },
      route: [
        {
          flyFrom: 'SCL',
          flyTo: 'MAD',
          local_departure: '2025-07-01T10:00:00',
          local_arrival: '2025-07-01T22:00:00',
          airline: 'LA',
          flight_no: 701,
          return: 0,
        },
        {
          flyFrom: 'MAD',
          flyTo: 'SCL',
          local_departure: '2025-07-15T08:00:00',
          local_arrival: '2025-07-15T22:00:00',
          airline: 'LA',
          flight_no: 702,
          return: 1,
        },
      ],
      deep_link: 'https://www.kiwi.com/booking/123',
    },
  ],
});

describe('KiwiSource', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    resetCache();
    // Pre-seed exchange rate cache so tests don't hit the network
    injectCache({ EUR: 0.9 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct name', () => {
    const source = new KiwiSource('api-key');
    expect(source.name).toBe('kiwi');
  });

  it('calls Kiwi API with correct params', async () => {
    const source = new KiwiSource('my-api-key');
    const config = makeConfig();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeKiwiApiResponse()),
    });

    await source.search(config, null);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('api.tequila.kiwi.com/v2/search');
    expect(url).toContain('fly_from=SCL');
    expect(url).toContain('fly_to=MAD');
    expect(url).toContain('adults=2');
    expect(url).toContain('limit=50');
    expect((opts.headers as Record<string, string>)['apikey']).toBe('my-api-key');
  });

  it('adds stopover params when stopover config present', async () => {
    const source = new KiwiSource('api-key');
    const config = makeConfig({
      stopover: { airport: 'MAD', minDays: 3, maxDays: 7 },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeKiwiApiResponse()),
    });

    await source.search(config, null);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('via=MAD');
    expect(url).toContain('stopover_from=3d');
    expect(url).toContain('stopover_to=7d');
  });

  it('returns normalized FlightResult array on success', async () => {
    const source = new KiwiSource('api-key');
    const config = makeConfig();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeKiwiApiResponse()),
    });

    const results = await source.search(config, null);

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('kiwi');
    expect(results[0].searchId).toBe('search-1');
    expect(results[0].totalPrice).toBe(1200);
  });

  it('returns [] when API responds with non-ok status', async () => {
    const source = new KiwiSource('api-key');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });

    const results = await source.search(makeConfig(), null);
    expect(results).toEqual([]);
  });

  it('returns [] when fetch throws', async () => {
    const source = new KiwiSource('api-key');
    fetchMock.mockRejectedValueOnce(new Error('network error'));

    const results = await source.search(makeConfig(), null);
    expect(results).toEqual([]);
  });

  it('passes proxyUrl in options when provided', async () => {
    const source = new KiwiSource('api-key');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeKiwiApiResponse()),
    });

    await source.search(makeConfig(), 'socks5://127.0.0.1:1080');

    const [, opts] = fetchMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts['proxyUrl']).toBe('socks5://127.0.0.1:1080');
  });

  it('uses first proxyRegion for normalization', async () => {
    const source = new KiwiSource('api-key');
    const config = makeConfig({ proxyRegions: ['AR'] });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeKiwiApiResponse()),
    });

    const results = await source.search(config, null);
    expect(results[0].proxyRegion).toBe('AR');
  });

  it('falls back to CL when proxyRegions is empty', async () => {
    const source = new KiwiSource('api-key');
    const config = makeConfig({ proxyRegions: [] });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeKiwiApiResponse()),
    });

    const results = await source.search(config, null);
    expect(results[0].proxyRegion).toBe('CL');
  });
});
