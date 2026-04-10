import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkyscannerSource } from '../../../src/sources/skyscanner.js';
import type { SearchConfig } from '@flight-hunter/shared';

const makeConfig = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
  id: 'search-2',
  name: 'Sky Test',
  origin: 'SCL',
  destination: 'MAD',
  departureFrom: new Date('2025-07-01'),
  departureTo: new Date('2025-07-15'),
  returnMinDays: 7,
  returnMaxDays: 14,
  passengers: 1,
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

const makeSkyscannerApiResponse = () => ({
  data: [
    {
      id: 'sky-1',
      price: 950,
      currency: 'USD',
      outbound: {
        origin: 'SCL',
        destination: 'MAD',
        departure: '2025-07-01T10:00:00',
        arrival: '2025-07-01T22:00:00',
        durationInMinutes: 720,
        stopCount: 0,
        carriers: ['LA'],
        flightNumbers: ['LA701'],
      },
      inbound: {
        origin: 'MAD',
        destination: 'SCL',
        departure: '2025-07-15T08:00:00',
        arrival: '2025-07-15T22:00:00',
        durationInMinutes: 840,
        stopCount: 0,
        carriers: ['IB'],
        flightNumbers: ['IB600'],
      },
      bookingUrl: 'https://skyscanner.com/booking/sky-1',
    },
  ],
});

describe('SkyscannerSource', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has correct name', () => {
    const source = new SkyscannerSource('rapid-key');
    expect(source.name).toBe('skyscanner');
  });

  it('calls Skyscanner API with correct headers', async () => {
    const source = new SkyscannerSource('my-rapid-key');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeSkyscannerApiResponse()),
    });

    await source.search(makeConfig(), null);

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('skyscanner80.p.rapidapi.com');
    expect(url).toContain('searchFlightsComplete');
    const headers = opts.headers as Record<string, string>;
    expect(headers['x-rapidapi-key']).toBe('my-rapid-key');
    expect(headers['x-rapidapi-host']).toBe('skyscanner80.p.rapidapi.com');
  });

  it('includes origin, destination, dates, adults in URL params', async () => {
    const source = new SkyscannerSource('key');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeSkyscannerApiResponse()),
    });

    await source.search(makeConfig(), null);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('origin=SCL');
    expect(url).toContain('destination=MAD');
    expect(url).toContain('adults=1');
    expect(url).toContain('currency=USD');
  });

  it('returns normalized FlightResult array on success', async () => {
    const source = new SkyscannerSource('key');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeSkyscannerApiResponse()),
    });

    const results = await source.search(makeConfig(), null);

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('skyscanner');
    expect(results[0].totalPrice).toBe(950);
    expect(results[0].searchId).toBe('search-2');
  });

  it('returns [] when API responds with non-ok status', async () => {
    const source = new SkyscannerSource('key');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });

    const results = await source.search(makeConfig(), null);
    expect(results).toEqual([]);
  });

  it('returns [] when fetch throws', async () => {
    const source = new SkyscannerSource('key');
    fetchMock.mockRejectedValueOnce(new Error('timeout'));

    const results = await source.search(makeConfig(), null);
    expect(results).toEqual([]);
  });

  it('uses first proxyRegion for normalization', async () => {
    const source = new SkyscannerSource('key');
    const config = makeConfig({ proxyRegions: ['AR'] });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeSkyscannerApiResponse()),
    });

    const results = await source.search(config, null);
    expect(results[0].proxyRegion).toBe('AR');
  });

  it('falls back to CL when proxyRegions is empty', async () => {
    const source = new SkyscannerSource('key');
    const config = makeConfig({ proxyRegions: [] });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeSkyscannerApiResponse()),
    });

    const results = await source.search(config, null);
    expect(results[0].proxyRegion).toBe('CL');
  });

  it('passes proxyUrl in fetch options when provided', async () => {
    const source = new SkyscannerSource('key');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeSkyscannerApiResponse()),
    });

    await source.search(makeConfig(), 'socks5://10.0.0.1:1080');

    const [, opts] = fetchMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts['proxyUrl']).toBe('socks5://10.0.0.1:1080');
  });
});
