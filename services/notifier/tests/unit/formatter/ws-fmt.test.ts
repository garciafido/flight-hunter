import { describe, it, expect } from 'vitest';
import { formatWebSocket } from '../../../src/formatter/ws-fmt.js';
import type { AlertJob } from '@flight-hunter/shared';

const baseAlert: AlertJob = {
  searchId: 'search-1',
  flightResultId: 'result-42',
  level: 'good',
  score: 75,
  scoreBreakdown: { price: 80, schedule: 70, stopover: 75, airline: 65, flexibility: 50 },
  flightSummary: {
    price: 350,
    currency: 'USD',
    airline: 'Iberia',
    departureAirport: 'SCL',
    arrivalAirport: 'BCN',
    departureTime: '2026-08-01T08:00:00.000Z',
    arrivalTime: '2026-08-20T08:00:00.000Z',
    bookingUrl: 'https://booking.example.com/iberia-456',
  },
};

describe('formatWebSocket', () => {
  it('returns a message with type alert', () => {
    const result = formatWebSocket(baseAlert, 'Europa Trip');
    expect(result.type).toBe('alert');
  });

  it('includes searchId in data', () => {
    const result = formatWebSocket(baseAlert, 'Europa Trip');
    expect(result.data.searchId).toBe('search-1');
  });

  it('includes searchName in data', () => {
    const result = formatWebSocket(baseAlert, 'Europa Trip');
    expect(result.data.searchName).toBe('Europa Trip');
  });

  it('includes flightResultId in data', () => {
    const result = formatWebSocket(baseAlert, 'Europa Trip');
    expect(result.data.flightResultId).toBe('result-42');
  });

  it('includes level in data', () => {
    const result = formatWebSocket(baseAlert, 'Europa Trip');
    expect(result.data.level).toBe('good');
  });

  it('includes score in data', () => {
    const result = formatWebSocket(baseAlert, 'Europa Trip');
    expect(result.data.score).toBe(75);
  });

  it('includes scoreBreakdown in data', () => {
    const result = formatWebSocket(baseAlert, 'Europa Trip');
    expect(result.data.scoreBreakdown).toEqual({ price: 80, schedule: 70, stopover: 75, airline: 65, flexibility: 50 });
  });

  it('includes flightSummary in data', () => {
    const result = formatWebSocket(baseAlert, 'Europa Trip');
    expect(result.data.flightSummary).toEqual(baseAlert.flightSummary);
  });
});
