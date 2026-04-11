import { describe, it, expect } from 'vitest';
import { RawResultJobSchema, AlertJobSchema } from '../src/queue/schemas.js';
import { QUEUE_NAMES } from '../src/queue/names.js';

const validLeg = {
  departure: { airport: 'SCL', time: '10:00' },
  arrival: { airport: 'MIA', time: '18:00' },
  airline: 'LATAM',
  flightNumber: 'LA800',
  durationMinutes: 480,
  stops: 0,
};

const validRawResult = {
  searchId: 'search-1',
  source: 'kiwi' as const,
  outbound: validLeg,
  inbound: {
    departure: { airport: 'MIA', time: '20:00' },
    arrival: { airport: 'SCL', time: '06:00' },
    airline: 'LATAM',
    flightNumber: 'LA801',
    durationMinutes: 600,
    stops: 1,
  },
  totalPrice: 850,
  currency: 'USD',
  pricePer: 'person' as const,
  passengers: 2,
  carryOnIncluded: true,
  bookingUrl: 'https://kiwi.com/booking/123',
  scrapedAt: '2025-06-01T00:00:00.000Z',
  proxyRegion: 'CL' as const,
};

const validAlertJob = {
  searchId: 'search-1',
  flightResultId: 'result-abc',
  level: 'good' as const,
  score: 75,
  scoreBreakdown: {
    price: 80,
    schedule: 70,
    stopover: 90,
    airline: 60,
    flexibility: 75,
  },
  flightSummary: {
    price: 850,
    currency: 'USD',
    airline: 'LATAM',
    departureAirport: 'SCL',
    arrivalAirport: 'MIA',
    departureTime: '2025-07-10T10:00:00.000Z',
    arrivalTime: '2025-07-10T18:00:00.000Z',
    bookingUrl: 'https://kiwi.com/booking/123',
  },
};

describe('QUEUE_NAMES', () => {
  it('exports correct queue name constants', () => {
    expect(QUEUE_NAMES.RAW_RESULTS).toBe('raw-results');
    expect(QUEUE_NAMES.ALERTS).toBe('alerts');
    expect(QUEUE_NAMES.SCRAPE_JOBS).toBe('scrape-jobs');
  });
});

describe('RawResultJobSchema', () => {
  it('parses valid raw result data', () => {
    const result = RawResultJobSchema.safeParse(validRawResult);
    expect(result.success).toBe(true);
  });

  it('rejects invalid source value', () => {
    const result = RawResultJobSchema.safeParse({
      ...validRawResult,
      source: 'invalid-source',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid proxy region', () => {
    const result = RawResultJobSchema.safeParse({
      ...validRawResult,
      proxyRegion: 'US',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid booking URL', () => {
    const result = RawResultJobSchema.safeParse({
      ...validRawResult,
      bookingUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects currency longer than 3 chars', () => {
    const result = RawResultJobSchema.safeParse({
      ...validRawResult,
      currency: 'USDD',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid scrapedAt datetime', () => {
    const result = RawResultJobSchema.safeParse({
      ...validRawResult,
      scrapedAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional stopover when provided', () => {
    const result = RawResultJobSchema.safeParse({
      ...validRawResult,
      stopover: {
        airport: 'BOG',
        arrivalTime: '2025-07-10T15:00:00.000Z',
        departureTime: '2025-07-12T16:00:00.000Z',
        durationDays: 2,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stopover?.airport).toBe('BOG');
    }
  });

  it('accepts result without stopover', () => {
    const result = RawResultJobSchema.safeParse(validRawResult);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stopover).toBeUndefined();
    }
  });

  it('rejects stopover with invalid datetime', () => {
    const result = RawResultJobSchema.safeParse({
      ...validRawResult,
      stopover: {
        airport: 'BOG',
        arrivalTime: 'bad-time',
        departureTime: '2025-07-12T16:00:00.000Z',
        durationDays: 2,
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive passengers', () => {
    const result = RawResultJobSchema.safeParse({
      ...validRawResult,
      passengers: 0,
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid source values', () => {
    for (const source of ['kiwi', 'skyscanner', 'google-flights'] as const) {
      const result = RawResultJobSchema.safeParse({ ...validRawResult, source });
      expect(result.success).toBe(true);
    }
  });

  it('accepts both pricePer values', () => {
    for (const pricePer of ['person', 'total'] as const) {
      const result = RawResultJobSchema.safeParse({ ...validRawResult, pricePer });
      expect(result.success).toBe(true);
    }
  });

  it('accepts both proxyRegion values', () => {
    for (const proxyRegion of ['CL', 'AR'] as const) {
      const result = RawResultJobSchema.safeParse({ ...validRawResult, proxyRegion });
      expect(result.success).toBe(true);
    }
  });
});

describe('AlertJobSchema', () => {
  it('parses valid alert job data', () => {
    const result = AlertJobSchema.safeParse(validAlertJob);
    expect(result.success).toBe(true);
  });

  it('rejects invalid alert level', () => {
    const result = AlertJobSchema.safeParse({
      ...validAlertJob,
      level: 'critical',
    });
    expect(result.success).toBe(false);
  });

  it('rejects score outside 0-100 range', () => {
    const tooHigh = AlertJobSchema.safeParse({ ...validAlertJob, score: 101 });
    expect(tooHigh.success).toBe(false);

    const tooLow = AlertJobSchema.safeParse({ ...validAlertJob, score: -1 });
    expect(tooLow.success).toBe(false);
  });

  it('rejects invalid booking URL in flightSummary', () => {
    const result = AlertJobSchema.safeParse({
      ...validAlertJob,
      flightSummary: { ...validAlertJob.flightSummary, bookingUrl: 'bad-url' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid datetime in flightSummary', () => {
    const result = AlertJobSchema.safeParse({
      ...validAlertJob,
      flightSummary: { ...validAlertJob.flightSummary, departureTime: 'not-a-date' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid alert levels', () => {
    for (const level of ['info', 'good', 'urgent'] as const) {
      const result = AlertJobSchema.safeParse({ ...validAlertJob, level });
      expect(result.success).toBe(true);
    }
  });

  it('accepts optional stopover fields in flightSummary', () => {
    const result = AlertJobSchema.safeParse({
      ...validAlertJob,
      flightSummary: {
        ...validAlertJob.flightSummary,
        stopoverAirport: 'BOG',
        stopoverDurationDays: 2,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flightSummary.stopoverAirport).toBe('BOG');
    }
  });

  it('rejects scoreBreakdown values outside 0-100', () => {
    const result = AlertJobSchema.safeParse({
      ...validAlertJob,
      scoreBreakdown: { ...validAlertJob.scoreBreakdown, price: 150 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts combo field when provided', () => {
    const result = AlertJobSchema.safeParse({
      ...validAlertJob,
      combo: {
        totalPrice: 650,
        legs: [
          {
            price: 350,
            currency: 'USD',
            airline: 'LATAM',
            departureAirport: 'BUE',
            arrivalAirport: 'CUZ',
            departureTime: '2026-07-25T10:00:00.000Z',
            arrivalTime: '2026-07-25T18:00:00.000Z',
            bookingUrl: 'https://booking.example.com/leg1',
          },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.combo?.totalPrice).toBe(650);
      expect(result.data.combo?.legs).toHaveLength(1);
    }
  });

  it('accepts a combo with connection-type waypoints', () => {
    const job = {
      searchId: 'search-1',
      flightResultId: 'result-abc',
      level: 'good' as const,
      score: 75,
      scoreBreakdown: {
        price: 80,
        schedule: 70,
        stopover: 90,
        airline: 60,
        flexibility: 75,
      },
      flightSummary: {
        price: 850,
        currency: 'USD',
        airline: 'LATAM',
        departureAirport: 'SCL',
        arrivalAirport: 'MIA',
        departureTime: '2025-07-10T10:00:00.000Z',
        arrivalTime: '2025-07-10T18:00:00.000Z',
        bookingUrl: 'https://kiwi.com/booking/123',
      },
      combo: {
        legs: [
          {
            price: 350,
            currency: 'USD',
            airline: 'LATAM',
            departureAirport: 'SCL',
            arrivalAirport: 'GRU',
            departureTime: '2026-07-25T10:00:00.000Z',
            arrivalTime: '2026-07-25T18:00:00.000Z',
            bookingUrl: 'https://booking.example.com/leg1',
          },
        ],
        totalPrice: 500,
        waypoints: [
          { airport: 'GRU', type: 'connection' as const, maxHours: 5 },
        ],
      },
    };
    expect(() => AlertJobSchema.parse(job)).not.toThrow();
  });

  it('accepts a combo with stay-type waypoints', () => {
    const result = AlertJobSchema.safeParse({
      ...validAlertJob,
      combo: {
        totalPrice: 650,
        legs: [
          {
            price: 350,
            currency: 'USD',
            airline: 'LATAM',
            departureAirport: 'BUE',
            arrivalAirport: 'CUZ',
            departureTime: '2026-07-25T10:00:00.000Z',
            arrivalTime: '2026-07-25T18:00:00.000Z',
            bookingUrl: 'https://booking.example.com/leg1',
          },
        ],
        waypoints: [
          { airport: 'LIM', type: 'stay' as const, minDays: 3, maxDays: 4 },
          { airport: 'CUZ', type: 'stay' as const, minDays: 7, maxDays: 10 },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts alert job without combo (roundtrip)', () => {
    const result = AlertJobSchema.safeParse(validAlertJob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.combo).toBeUndefined();
    }
  });
});
