import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TravelpayoutsSource } from '../../../src/sources/travelpayouts.js';
import type { SearchConfig } from '@flight-hunter/shared';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const searchConfig: SearchConfig = {
  id: 'search-1',
  name: 'Test',
  origin: 'BUE',
  destination: 'CUZ',
  departureFrom: new Date('2026-07-25'),
  departureTo: new Date('2026-07-25'),
  returnMinDays: 15,
  returnMaxDays: 20,
  passengers: 1,
  filters: {
    airlineBlacklist: [],
    airlinePreferred: [],
    airportPreferred: {},
    airportBlacklist: {},
    maxUnplannedStops: 1,
    minConnectionTime: 60,
    maxConnectionTime: 480,
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
};

const travelpayoutsResponse = {
  success: true,
  currency: 'usd',
  data: [
    {
      value: 285,
      trip_class: 0,
      show_to_affiliates: true,
      return_date: '2026-08-09',
      origin: 'BUE',
      destination: 'CUZ',
      depart_date: '2026-07-25',
      number_of_changes: 1,
      gate: 'OneTwoTrip',
      found_at: '2026-04-10T12:00:00',
      duration: 720,
      distance: 4500,
      actual: true,
    },
  ],
};

describe('TravelpayoutsSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has correct name', () => {
    const source = new TravelpayoutsSource('token-abc');
    expect(source.name).toBe('travelpayouts');
  });

  it('returns empty array when no token provided', async () => {
    const source = new TravelpayoutsSource('');
    const results = await source.search(searchConfig, null);
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls Travelpayouts API with correct params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(travelpayoutsResponse),
    });

    const source = new TravelpayoutsSource('my-token');
    await source.search(searchConfig, null);

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('api.travelpayouts.com/v2/prices/latest');
    expect(url).toContain('origin=BUE');
    expect(url).toContain('destination=CUZ');
    expect(url).toContain('token=my-token');
    expect(url).toContain('currency=usd');
  });

  it('returns normalized FlightResult on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(travelpayoutsResponse),
    });

    const source = new TravelpayoutsSource('token');
    const results = await source.search(searchConfig, null);

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('travelpayouts');
    expect(results[0].searchId).toBe('search-1');
    expect(results[0].totalPrice).toBe(285);
    expect(results[0].currency).toBe('USD');
    expect(results[0].outbound.departure.airport).toBe('BUE');
    expect(results[0].inbound.departure.airport).toBe('CUZ');
    expect(results[0].outbound.stops).toBe(1);
  });

  it('sets priceOriginal and currencyOriginal', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(travelpayoutsResponse),
    });

    const source = new TravelpayoutsSource('token');
    const results = await source.search(searchConfig, null);

    expect(results[0].priceOriginal).toBe(285);
    expect(results[0].currencyOriginal).toBe('USD');
  });

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });

    const source = new TravelpayoutsSource('token');
    const results = await source.search(searchConfig, null);
    expect(results).toEqual([]);
  });

  it('returns empty array when success=false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: false, data: [], currency: 'usd' }),
    });

    const source = new TravelpayoutsSource('token');
    const results = await source.search(searchConfig, null);
    expect(results).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const source = new TravelpayoutsSource('token');
    const results = await source.search(searchConfig, null);
    expect(results).toEqual([]);
  });

  it('uses first proxyRegion from config', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(travelpayoutsResponse),
    });

    const source = new TravelpayoutsSource('token');
    const config = { ...searchConfig, proxyRegions: ['AR'] };
    const results = await source.search(config, null);

    expect(results[0].proxyRegion).toBe('AR');
  });
});
