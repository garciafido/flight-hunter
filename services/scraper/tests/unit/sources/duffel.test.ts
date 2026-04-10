import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DuffelSource } from '../../../src/sources/duffel.js';
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

const duffelOfferRequest = {
  data: { id: 'orq_123' },
};

const duffelOffer = {
  id: 'off_456',
  total_amount: '350.00',
  total_currency: 'USD',
  slices: [
    {
      duration: 'PT6H30M',
      origin: { iata_code: 'BUE' },
      destination: { iata_code: 'CUZ' },
      segments: [
        {
          departing_at: '2026-07-25T10:00:00',
          arriving_at: '2026-07-25T16:30:00',
          origin: { iata_code: 'BUE' },
          destination: { iata_code: 'CUZ' },
          operating_carrier: { iata_code: 'LA' },
          operating_carrier_flight_number: '1234',
          duration: 'PT6H30M',
        },
      ],
    },
    {
      duration: 'PT7H',
      origin: { iata_code: 'CUZ' },
      destination: { iata_code: 'BUE' },
      segments: [
        {
          departing_at: '2026-08-09T09:00:00',
          arriving_at: '2026-08-09T16:00:00',
          origin: { iata_code: 'CUZ' },
          destination: { iata_code: 'BUE' },
          operating_carrier: { iata_code: 'LA' },
          operating_carrier_flight_number: '5678',
          duration: 'PT7H',
        },
      ],
    },
  ],
};

describe('DuffelSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct name', () => {
    const source = new DuffelSource('token-abc');
    expect(source.name).toBe('duffel');
  });

  it('returns empty array when no token provided', async () => {
    const source = new DuffelSource('');
    const results = await source.search(searchConfig, null);
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('creates offer request and fetches offers', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(duffelOfferRequest),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [duffelOffer] }),
      });

    const source = new DuffelSource('duffel-token');
    await source.search(searchConfig, null);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First call: create offer request
    const [firstUrl, firstOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toContain('/air/offer_requests');
    expect(firstOpts.method).toBe('POST');
    expect((firstOpts.headers as Record<string, string>)['Authorization']).toBe('Bearer duffel-token');
    // Second call: fetch offers
    const [secondUrl] = mockFetch.mock.calls[1] as [string];
    expect(secondUrl).toContain('/air/offers');
    expect(secondUrl).toContain('offer_request_id=orq_123');
  });

  it('returns normalized FlightResult on success', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(duffelOfferRequest),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [duffelOffer] }),
      });

    const source = new DuffelSource('token');
    const results = await source.search(searchConfig, null);

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('duffel');
    expect(results[0].totalPrice).toBe(350);
    expect(results[0].currency).toBe('USD');
    expect(results[0].outbound.departure.airport).toBe('BUE');
    expect(results[0].inbound.departure.airport).toBe('CUZ');
    expect(results[0].outbound.durationMinutes).toBe(390);
  });

  it('sets priceOriginal and currencyOriginal', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(duffelOfferRequest),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [duffelOffer] }),
      });

    const source = new DuffelSource('token');
    const results = await source.search(searchConfig, null);

    expect(results[0].priceOriginal).toBe(350);
    expect(results[0].currencyOriginal).toBe('USD');
  });

  it('returns empty array when offer request fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 });

    const source = new DuffelSource('token');
    const results = await source.search(searchConfig, null);
    expect(results).toEqual([]);
  });

  it('returns empty array when offers fetch fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(duffelOfferRequest),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const source = new DuffelSource('token');
    const results = await source.search(searchConfig, null);
    expect(results).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const source = new DuffelSource('token');
    const results = await source.search(searchConfig, null);
    expect(results).toEqual([]);
  });

  it('filters out offers without 2 slices', async () => {
    const badOffer = { ...duffelOffer, slices: [duffelOffer.slices[0]] };
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(duffelOfferRequest),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [badOffer, duffelOffer] }),
      });

    const source = new DuffelSource('token');
    const results = await source.search(searchConfig, null);
    // Only the valid offer should be returned
    expect(results).toHaveLength(1);
  });
});
