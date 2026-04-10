import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmadeusSource } from '../../../src/sources/amadeus.js';
import type { SearchConfig } from '@flight-hunter/shared';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const searchConfig: SearchConfig = {
  id: 'search-1',
  name: 'Test',
  origin: 'BUE',
  destination: 'CUZ',
  departureFrom: new Date('2026-07-24'),
  departureTo: new Date('2026-07-25'),
  returnMinDays: 15,
  returnMaxDays: 20,
  passengers: 2,
  filters: {
    airlineBlacklist: [],
    airlinePreferred: [],
    airportPreferred: {},
    airportBlacklist: {},
    maxUnplannedStops: 1,
    minConnectionTime: 60,
    maxConnectionTime: 480,
    requireCarryOn: true,
    maxTotalTravelTime: 12,
  },
  alertConfig: {
    scoreThresholds: { info: 60, good: 75, urgent: 90 },
    maxPricePerPerson: 600,
    currency: 'USD',
  },
  proxyRegions: ['CL'],
  scanIntervalMin: 15,
  active: true,
};

const tokenResponse = {
  ok: true,
  json: () => Promise.resolve({ access_token: 'test-token', expires_in: 1799 }),
};

const amadeusOffer = {
  id: 'offer-1',
  itineraries: [
    {
      duration: 'PT5H30M',
      segments: [
        {
          departure: { iataCode: 'AEP', at: '2026-07-24T10:00:00' },
          arrival: { iataCode: 'LIM', at: '2026-07-24T15:00:00' },
          carrierCode: 'LA',
          number: '1234',
          duration: 'PT5H',
        },
      ],
    },
    {
      duration: 'PT8H',
      segments: [
        {
          departure: { iataCode: 'CUZ', at: '2026-08-08T10:00:00' },
          arrival: { iataCode: 'LIM', at: '2026-08-08T11:30:00' },
          carrierCode: 'LA',
          number: '5678',
          duration: 'PT1H30M',
        },
        {
          departure: { iataCode: 'LIM', at: '2026-08-08T14:00:00' },
          arrival: { iataCode: 'AEP', at: '2026-08-08T20:00:00' },
          carrierCode: 'LA',
          number: '9012',
          duration: 'PT6H',
        },
      ],
    },
  ],
  price: { total: '570.00', currency: 'USD' },
  travelerPricings: [{ fareDetailsBySegment: [{ cabin: 'ECONOMY' }] }],
};

describe('AmadeusSource', () => {
  let source: AmadeusSource;

  beforeEach(() => {
    vi.clearAllMocks();
    source = new AmadeusSource('test-key', 'test-secret');
  });

  it('authenticates and searches', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [amadeusOffer] }),
      });

    const results = await source.search(searchConfig, null);

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('amadeus');
    expect(results[0].totalPrice).toBe(570);
    expect(results[0].outbound.departure.airport).toBe('AEP');
    expect(results[0].inbound.arrival.airport).toBe('AEP');
    expect(results[0].inbound.stops).toBe(1);
  });

  it('reuses cached token', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) });

    await source.search(searchConfig, null);
    await source.search(searchConfig, null);

    // Only 1 token request + 2 search requests = 3 total
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toContain('oauth2/token');
    expect(mockFetch.mock.calls[1][0]).toContain('flight-offers');
    expect(mockFetch.mock.calls[2][0]).toContain('flight-offers');
  });

  it('returns empty array when no API keys', async () => {
    const noKeySource = new AmadeusSource('', '');
    const results = await noKeySource.search(searchConfig, null);
    expect(results).toEqual([]);
  });

  it('returns empty array on auth failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const results = await source.search(searchConfig, null);
    expect(results).toEqual([]);
  });

  it('returns empty array on search failure', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const results = await source.search(searchConfig, null);
    expect(results).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const results = await source.search(searchConfig, null);
    expect(results).toEqual([]);
  });

  it('sends correct search params', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) });

    await source.search(searchConfig, null);

    const searchUrl = mockFetch.mock.calls[1][0] as string;
    expect(searchUrl).toContain('originLocationCode=BUE');
    expect(searchUrl).toContain('destinationLocationCode=CUZ');
    expect(searchUrl).toContain('adults=2');
    expect(searchUrl).toContain('currencyCode=USD');
  });

  it('sends bearer token in search request', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) });

    await source.search(searchConfig, null);

    const searchOpts = mockFetch.mock.calls[1][1] as RequestInit;
    expect((searchOpts.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });
});
