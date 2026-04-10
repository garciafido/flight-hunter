import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeKiwiResult,
  normalizeSkyscannerResult,
  normalizeAmadeusResult,
} from '../../src/normalizer.js';
import type { KiwiData, SkyscannerData, AmadeusOffer } from '../../src/normalizer.js';
import { resetCache, injectCache } from '../../src/utils/exchange-rates.js';

// Inject a fake exchange-rate cache so tests don't hit the network.
// USD=1 means priceUsd == priceOriginal for USD-priced results.
beforeEach(() => {
  resetCache();
  injectCache({ EUR: 0.9, ARS: 900, GBP: 0.8 });
});

const makeKiwiData = (overrides: Partial<KiwiData> = {}): KiwiData => ({
  id: 'kiwi-1',
  flyFrom: 'SCL',
  flyTo: 'MAD',
  local_departure: '2025-07-01T10:00:00',
  local_arrival: '2025-07-15T12:00:00',
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
  ...overrides,
});

describe('normalizeKiwiResult', () => {
  it('maps basic fields correctly', async () => {
    const data = makeKiwiData();
    const result = await normalizeKiwiResult(data, 'search-1', 2, 'CL');

    expect(result.searchId).toBe('search-1');
    expect(result.source).toBe('kiwi');
    expect(result.totalPrice).toBe(1200); // USD→USD: 1:1
    expect(result.currency).toBe('USD');
    expect(result.pricePer).toBe('total');
    expect(result.passengers).toBe(2);
    expect(result.proxyRegion).toBe('CL');
    expect(result.bookingUrl).toBe('https://www.kiwi.com/booking/123');
    expect(result.scrapedAt).toBeInstanceOf(Date);
  });

  it('populates priceOriginal, currencyOriginal, priceUsd, exchangeRateAt', async () => {
    const data = makeKiwiData({ price: 1200, currency: 'USD' });
    const result = await normalizeKiwiResult(data, 'search-1', 1, 'CL');

    expect(result.priceOriginal).toBe(1200);
    expect(result.currencyOriginal).toBe('USD');
    expect(result.priceUsd).toBe(1200);
    expect(result.exchangeRateAt).toBeInstanceOf(Date);
  });

  it('converts non-USD currency to USD', async () => {
    // EUR price: cache says EUR=0.9, so 1 EUR = 1/0.9 ≈ 1.111 USD
    const data = makeKiwiData({ price: 900, currency: 'EUR' });
    const result = await normalizeKiwiResult(data, 'search-1', 1, 'CL');

    expect(result.currencyOriginal).toBe('EUR');
    expect(result.priceOriginal).toBe(900);
    // 900 * (1/0.9) = 1000 USD
    expect(result.priceUsd).toBeCloseTo(1000, 1);
    expect(result.totalPrice).toBeCloseTo(1000, 1);
  });

  it('defaults currency to USD when not provided', async () => {
    const data = makeKiwiData({ currency: undefined });
    const result = await normalizeKiwiResult(data, 'search-1', 1, 'AR');
    expect(result.currency).toBe('USD');
    expect(result.currencyOriginal).toBe('USD');
  });

  it('maps outbound leg correctly', async () => {
    const data = makeKiwiData();
    const result = await normalizeKiwiResult(data, 's1', 1, 'CL');

    expect(result.outbound.departure.airport).toBe('SCL');
    expect(result.outbound.departure.time).toBe('2025-07-01T10:00:00');
    expect(result.outbound.arrival.airport).toBe('MAD');
    expect(result.outbound.arrival.time).toBe('2025-07-01T22:00:00');
    expect(result.outbound.airline).toBe('LA');
    expect(result.outbound.flightNumber).toBe('LA701');
    expect(result.outbound.stops).toBe(0);
  });

  it('maps inbound leg correctly', async () => {
    const data = makeKiwiData();
    const result = await normalizeKiwiResult(data, 's1', 1, 'CL');

    expect(result.inbound.departure.airport).toBe('MAD');
    expect(result.inbound.arrival.airport).toBe('SCL');
    expect(result.inbound.airline).toBe('LA');
    expect(result.inbound.flightNumber).toBe('LA702');
    expect(result.inbound.stops).toBe(0);
  });

  it('marks carryOnIncluded true when hand bag price is 0', async () => {
    const data = makeKiwiData({ bags_price: { hand: 0 } });
    const result = await normalizeKiwiResult(data, 's1', 1, 'CL');
    expect(result.carryOnIncluded).toBe(true);
  });

  it('marks carryOnIncluded false when hand bag costs money', async () => {
    const data = makeKiwiData({ bags_price: { hand: 20 } });
    const result = await normalizeKiwiResult(data, 's1', 1, 'CL');
    expect(result.carryOnIncluded).toBe(false);
  });

  it('detects no stopover for direct outbound flight', async () => {
    const data = makeKiwiData();
    const result = await normalizeKiwiResult(data, 's1', 1, 'CL');
    expect(result.stopover).toBeUndefined();
  });

  it('detects stopover when gap >24h between outbound segments', async () => {
    const data = makeKiwiData({
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
          flyTo: 'LIS',
          local_departure: '2025-07-03T10:00:00', // 36h gap → stopover
          local_arrival: '2025-07-03T11:00:00',
          airline: 'IB',
          flight_no: 500,
          return: 0,
        },
        {
          flyFrom: 'LIS',
          flyTo: 'SCL',
          local_departure: '2025-07-15T08:00:00',
          local_arrival: '2025-07-15T22:00:00',
          airline: 'TP',
          flight_no: 200,
          return: 1,
        },
      ],
    });
    const result = await normalizeKiwiResult(data, 's1', 1, 'CL');

    expect(result.stopover).toBeDefined();
    expect(result.stopover?.airport).toBe('MAD');
    expect(result.stopover?.durationDays).toBe(2); // ~36h → 2 days (rounded)
  });

  it('does not detect stopover when gap is exactly 24h', async () => {
    const data = makeKiwiData({
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
          flyTo: 'LIS',
          local_departure: '2025-07-02T22:00:00', // exactly 24h gap — NOT stopover
          local_arrival: '2025-07-02T23:00:00',
          airline: 'IB',
          flight_no: 500,
          return: 0,
        },
        {
          flyFrom: 'LIS',
          flyTo: 'SCL',
          local_departure: '2025-07-15T08:00:00',
          local_arrival: '2025-07-15T22:00:00',
          airline: 'TP',
          flight_no: 200,
          return: 1,
        },
      ],
    });
    const result = await normalizeKiwiResult(data, 's1', 1, 'CL');
    expect(result.stopover).toBeUndefined();
  });

  it('correctly counts stops for multi-segment outbound', async () => {
    const data = makeKiwiData({
      route: [
        {
          flyFrom: 'SCL',
          flyTo: 'BOG',
          local_departure: '2025-07-01T06:00:00',
          local_arrival: '2025-07-01T09:00:00',
          airline: 'AV',
          flight_no: 100,
          return: 0,
        },
        {
          flyFrom: 'BOG',
          flyTo: 'MAD',
          local_departure: '2025-07-01T11:00:00',
          local_arrival: '2025-07-01T22:00:00',
          airline: 'AV',
          flight_no: 101,
          return: 0,
        },
        {
          flyFrom: 'MAD',
          flyTo: 'SCL',
          local_departure: '2025-07-15T08:00:00',
          local_arrival: '2025-07-15T22:00:00',
          airline: 'IB',
          flight_no: 600,
          return: 1,
        },
      ],
    });
    const result = await normalizeKiwiResult(data, 's1', 1, 'CL');
    expect(result.outbound.stops).toBe(1);
  });

  it('computes outbound duration from first departure to last arrival', async () => {
    const data = makeKiwiData();
    const result = await normalizeKiwiResult(data, 's1', 1, 'CL');
    // 10:00 to 22:00 = 12 hours = 720 minutes
    expect(result.outbound.durationMinutes).toBe(720);
  });
});

// ─── Skyscanner ───────────────────────────────────────────────────────────────

const makeSkyscannerData = (overrides: Partial<SkyscannerData> = {}): SkyscannerData => ({
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
  ...overrides,
});

describe('normalizeSkyscannerResult', () => {
  it('maps basic fields correctly', async () => {
    const data = makeSkyscannerData();
    const result = await normalizeSkyscannerResult(data, 'search-2', 2, 'AR');

    expect(result.searchId).toBe('search-2');
    expect(result.source).toBe('skyscanner');
    expect(result.totalPrice).toBe(950);
    expect(result.currency).toBe('USD');
    expect(result.pricePer).toBe('total');
    expect(result.passengers).toBe(2);
    expect(result.proxyRegion).toBe('AR');
    expect(result.bookingUrl).toBe('https://skyscanner.com/booking/sky-1');
    expect(result.scrapedAt).toBeInstanceOf(Date);
    expect(result.carryOnIncluded).toBe(false);
    expect(result.stopover).toBeUndefined();
  });

  it('populates priceOriginal, currencyOriginal, priceUsd, exchangeRateAt', async () => {
    const data = makeSkyscannerData({ price: 950, currency: 'USD' });
    const result = await normalizeSkyscannerResult(data, 'search-2', 1, 'CL');

    expect(result.priceOriginal).toBe(950);
    expect(result.currencyOriginal).toBe('USD');
    expect(result.priceUsd).toBe(950);
    expect(result.exchangeRateAt).toBeInstanceOf(Date);
  });

  it('converts non-USD currency to USD', async () => {
    const data = makeSkyscannerData({ price: 800, currency: 'GBP' });
    const result = await normalizeSkyscannerResult(data, 'search-2', 1, 'CL');

    // GBP=0.8 → 1 GBP = 1/0.8 = 1.25 USD → 800 * 1.25 = 1000
    expect(result.priceUsd).toBeCloseTo(1000, 1);
    expect(result.totalPrice).toBeCloseTo(1000, 1);
    expect(result.currencyOriginal).toBe('GBP');
    expect(result.priceOriginal).toBe(800);
  });

  it('maps outbound leg correctly', async () => {
    const data = makeSkyscannerData();
    const result = await normalizeSkyscannerResult(data, 's2', 1, 'CL');

    expect(result.outbound.departure.airport).toBe('SCL');
    expect(result.outbound.departure.time).toBe('2025-07-01T10:00:00');
    expect(result.outbound.arrival.airport).toBe('MAD');
    expect(result.outbound.arrival.time).toBe('2025-07-01T22:00:00');
    expect(result.outbound.airline).toBe('LA');
    expect(result.outbound.flightNumber).toBe('LA701');
    expect(result.outbound.durationMinutes).toBe(720);
    expect(result.outbound.stops).toBe(0);
  });

  it('maps inbound leg correctly', async () => {
    const data = makeSkyscannerData();
    const result = await normalizeSkyscannerResult(data, 's2', 1, 'CL');

    expect(result.inbound.departure.airport).toBe('MAD');
    expect(result.inbound.arrival.airport).toBe('SCL');
    expect(result.inbound.airline).toBe('IB');
    expect(result.inbound.flightNumber).toBe('IB600');
    expect(result.inbound.durationMinutes).toBe(840);
    expect(result.inbound.stops).toBe(0);
  });

  it('uses empty string when carriers array is empty', async () => {
    const data = makeSkyscannerData({
      outbound: {
        origin: 'SCL',
        destination: 'MAD',
        departure: '2025-07-01T10:00:00',
        arrival: '2025-07-01T22:00:00',
        durationInMinutes: 720,
        stopCount: 1,
        carriers: [],
        flightNumbers: [],
      },
      inbound: {
        origin: 'MAD',
        destination: 'SCL',
        departure: '2025-07-15T08:00:00',
        arrival: '2025-07-15T22:00:00',
        durationInMinutes: 840,
        stopCount: 0,
        carriers: [],
        flightNumbers: [],
      },
    });
    const result = await normalizeSkyscannerResult(data, 's2', 1, 'CL');
    expect(result.outbound.airline).toBe('');
    expect(result.outbound.flightNumber).toBe('');
  });
});

// ─── Amadeus ─────────────────────────────────────────────────────────────────

const makeAmadeusOffer = (overrides: Partial<AmadeusOffer> = {}): AmadeusOffer => ({
  id: 'offer-1',
  itineraries: [
    {
      duration: 'PT5H30M',
      segments: [
        {
          departure: { iataCode: 'AEP', at: '2026-07-24T10:00:00' },
          arrival: { iataCode: 'CUZ', at: '2026-07-24T15:30:00' },
          carrierCode: 'LA',
          number: '1234',
          duration: 'PT5H30M',
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
  ...overrides,
});

describe('normalizeAmadeusResult', () => {
  it('maps basic fields correctly', async () => {
    const offer = makeAmadeusOffer();
    const result = await normalizeAmadeusResult(offer, 'search-3', 2, 'CL');

    expect(result.searchId).toBe('search-3');
    expect(result.source).toBe('amadeus');
    expect(result.totalPrice).toBe(570);
    expect(result.currency).toBe('USD');
    expect(result.pricePer).toBe('total');
    expect(result.passengers).toBe(2);
    expect(result.proxyRegion).toBe('CL');
    expect(result.carryOnIncluded).toBe(true);
    expect(result.scrapedAt).toBeInstanceOf(Date);
  });

  it('populates priceOriginal, currencyOriginal, priceUsd, exchangeRateAt', async () => {
    const offer = makeAmadeusOffer({ price: { total: '570.00', currency: 'USD' } });
    const result = await normalizeAmadeusResult(offer, 'search-3', 2, 'CL');

    expect(result.priceOriginal).toBe(570);
    expect(result.currencyOriginal).toBe('USD');
    expect(result.priceUsd).toBe(570);
    expect(result.exchangeRateAt).toBeInstanceOf(Date);
  });

  it('converts non-USD currency to USD', async () => {
    // EUR=0.9 → 1 EUR = 1/0.9 USD
    const offer = makeAmadeusOffer({ price: { total: '450.00', currency: 'EUR' } });
    const result = await normalizeAmadeusResult(offer, 'search-3', 1, 'CL');

    // 450 * (1/0.9) = 500 USD
    expect(result.priceUsd).toBeCloseTo(500, 1);
    expect(result.totalPrice).toBeCloseTo(500, 1);
    expect(result.currencyOriginal).toBe('EUR');
    expect(result.priceOriginal).toBe(450);
  });

  it('maps outbound leg correctly', async () => {
    const result = await normalizeAmadeusResult(makeAmadeusOffer(), 's3', 1, 'AR');

    expect(result.outbound.departure.airport).toBe('AEP');
    expect(result.outbound.arrival.airport).toBe('CUZ');
    expect(result.outbound.airline).toBe('LA');
    expect(result.outbound.flightNumber).toBe('LA1234');
    expect(result.outbound.durationMinutes).toBe(330); // 5h30m
    expect(result.outbound.stops).toBe(0);
  });

  it('maps inbound leg with stops', async () => {
    const result = await normalizeAmadeusResult(makeAmadeusOffer(), 's3', 1, 'CL');

    expect(result.inbound.departure.airport).toBe('CUZ');
    expect(result.inbound.arrival.airport).toBe('AEP');
    expect(result.inbound.stops).toBe(1);
    expect(result.inbound.durationMinutes).toBe(480); // 8h
  });

  it('detects stopover when gap >24h between outbound segments', async () => {
    const offer = makeAmadeusOffer({
      itineraries: [
        {
          duration: 'PT77H',
          segments: [
            {
              departure: { iataCode: 'AEP', at: '2026-07-24T10:00:00' },
              arrival: { iataCode: 'LIM', at: '2026-07-24T15:00:00' },
              carrierCode: 'LA',
              number: '100',
              duration: 'PT5H',
            },
            {
              departure: { iataCode: 'LIM', at: '2026-07-27T10:00:00' },
              arrival: { iataCode: 'CUZ', at: '2026-07-27T12:00:00' },
              carrierCode: 'LA',
              number: '200',
              duration: 'PT2H',
            },
          ],
        },
        {
          duration: 'PT8H',
          segments: [
            {
              departure: { iataCode: 'CUZ', at: '2026-08-08T10:00:00' },
              arrival: { iataCode: 'AEP', at: '2026-08-08T18:00:00' },
              carrierCode: 'LA',
              number: '300',
              duration: 'PT8H',
            },
          ],
        },
      ],
    });

    const result = await normalizeAmadeusResult(offer, 's3', 2, 'CL');

    expect(result.stopover).toBeDefined();
    expect(result.stopover?.airport).toBe('LIM');
    expect(result.stopover?.durationDays).toBe(3);
  });

  it('parses ISO duration correctly', async () => {
    const offer = makeAmadeusOffer({
      itineraries: [
        {
          duration: 'PT12H45M',
          segments: [{
            departure: { iataCode: 'AEP', at: '2026-07-24T06:00:00' },
            arrival: { iataCode: 'CUZ', at: '2026-07-24T18:45:00' },
            carrierCode: 'LA',
            number: '100',
            duration: 'PT12H45M',
          }],
        },
        {
          duration: 'PT3H',
          segments: [{
            departure: { iataCode: 'CUZ', at: '2026-08-08T10:00:00' },
            arrival: { iataCode: 'AEP', at: '2026-08-08T13:00:00' },
            carrierCode: 'LA',
            number: '200',
            duration: 'PT3H',
          }],
        },
      ],
    });

    const result = await normalizeAmadeusResult(offer, 's3', 1, 'CL');
    expect(result.outbound.durationMinutes).toBe(765); // 12*60+45
    expect(result.inbound.durationMinutes).toBe(180); // 3*60
  });
});
