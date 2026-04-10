import { describe, it, expect } from 'vitest';
import { formatSlack } from '../../../src/formatter/slack-fmt.js';
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

describe('formatSlack', () => {
  it('includes OFERTA URGENTE for urgent level', () => {
    const result = formatSlack(baseAlert, 'Vacaciones Europa');
    expect(result).toContain('OFERTA URGENTE');
    expect(result).toContain('Vacaciones Europa');
  });

  it('includes price and score', () => {
    const result = formatSlack(baseAlert, 'Test Search');
    expect(result).toContain('285');
    expect(result).toContain('87');
  });

  it('includes airline and route', () => {
    const result = formatSlack(baseAlert, 'Test Search');
    expect(result).toContain('LATAM');
    expect(result).toContain('SCL');
    expect(result).toContain('MAD');
  });

  it('includes booking URL in Slack format', () => {
    const result = formatSlack(baseAlert, 'Test Search');
    expect(result).toContain('<https://booking.example.com/flight-123|Reservar aquí>');
  });

  it('formats good level alert', () => {
    const result = formatSlack({ ...baseAlert, level: 'good' }, 'Test Search');
    expect(result).toContain('BUENA OFERTA');
    expect(result).toContain(':white_check_mark:');
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
          {
            departureAirport: 'LIM',
            arrivalAirport: 'MAD',
            airline: 'Iberia',
            price: 450,
            departureTime: '2026-06-17T08:00:00.000Z',
            arrivalTime: '2026-06-17T20:00:00.000Z',
            bookingUrl: 'https://booking.example.com/leg2',
          },
        ],
      },
    };
    const result = formatSlack(comboAlert, 'Combo Search');
    expect(result).toContain('650');
    expect(result).toContain('Tramo 1');
    expect(result).toContain('Tramo 2');
  });
});
