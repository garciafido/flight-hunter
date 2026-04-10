import { describe, it, expect } from 'vitest';
import { formatDiscord } from '../../../src/formatter/discord-fmt.js';
import type { AlertJob } from '@flight-hunter/shared';

const baseAlert: AlertJob = {
  searchId: 'search-1',
  flightResultId: 'result-1',
  level: 'urgent',
  score: 87,
  scoreBreakdown: { price: 90, schedule: 80, stopover: 85, airline: 70, flexibility: 60 },
  flightSummary: {
    price: 285,
    currency: 'USD',
    airline: 'LATAM',
    departureAirport: 'SCL',
    arrivalAirport: 'MAD',
    departureTime: '2026-06-15T10:00:00.000Z',
    arrivalTime: '2026-07-15T10:00:00.000Z',
    bookingUrl: 'https://booking.example.com/flight-123',
  },
};

describe('formatDiscord', () => {
  it('returns content and embeds', () => {
    const result = formatDiscord(baseAlert, 'Vacaciones Europa');
    expect(result.content).toBeDefined();
    expect(result.embeds).toHaveLength(1);
  });

  it('includes OFERTA URGENTE for urgent level', () => {
    const result = formatDiscord(baseAlert, 'Vacaciones Europa');
    expect(result.content).toContain('OFERTA URGENTE');
    expect(result.content).toContain('Vacaciones Europa');
  });

  it('embed has correct color for urgent', () => {
    const result = formatDiscord(baseAlert, 'Test');
    expect(result.embeds[0].color).toBe(0xff0000);
  });

  it('embed has correct color for good', () => {
    const result = formatDiscord({ ...baseAlert, level: 'good' }, 'Test');
    expect(result.embeds[0].color).toBe(0x22c55e);
  });

  it('embed includes price and airline info', () => {
    const result = formatDiscord(baseAlert, 'Test');
    expect(result.embeds[0].description).toContain('285');
    expect(result.embeds[0].description).toContain('LATAM');
  });

  it('embed url points to booking URL', () => {
    const result = formatDiscord(baseAlert, 'Test');
    expect(result.embeds[0].url).toBe('https://booking.example.com/flight-123');
  });

  it('formats combo alert', () => {
    const comboAlert: AlertJob = {
      ...baseAlert,
      combo: {
        totalPrice: 650,
        legs: [
          {
            departureAirport: 'SCL',
            arrivalAirport: 'LIM',
            airline: 'LATAM',
            price: 200,
            departureTime: '2026-06-15T10:00:00.000Z',
            arrivalTime: '2026-06-15T14:00:00.000Z',
            bookingUrl: 'https://booking.example.com/leg1',
          },
        ],
      },
    };
    const result = formatDiscord(comboAlert, 'Combo Search');
    expect(result.embeds[0].description).toContain('650');
    expect(result.embeds[0].description).toContain('Tramo 1');
  });
});
