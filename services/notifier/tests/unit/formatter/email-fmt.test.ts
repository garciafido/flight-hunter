import { describe, it, expect } from 'vitest';
import { formatEmail } from '../../../src/formatter/email-fmt.js';
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

describe('formatEmail', () => {
  it('returns subject and html', () => {
    const result = formatEmail(baseAlert, 'Vacaciones Europa');
    expect(result).toHaveProperty('subject');
    expect(result).toHaveProperty('html');
  });

  it('formats subject with URGENTE for urgent level', () => {
    const result = formatEmail(baseAlert, 'Vacaciones Europa');
    expect(result.subject).toBe('[Flight Hunter] URGENTE: USD 285/persona — Vacaciones Europa');
  });

  it('formats subject with BUENA OFERTA for good level', () => {
    const alert: AlertJob = { ...baseAlert, level: 'good' };
    const result = formatEmail(alert, 'Test Search');
    expect(result.subject).toBe('[Flight Hunter] BUENA OFERTA: USD 285/persona — Test Search');
  });

  it('formats subject with INFO for info level', () => {
    const alert: AlertJob = { ...baseAlert, level: 'info' };
    const result = formatEmail(alert, 'My Search');
    expect(result.subject).toBe('[Flight Hunter] INFO: USD 285/persona — My Search');
  });

  it('includes price in HTML', () => {
    const result = formatEmail(baseAlert, 'Test');
    expect(result.html).toContain('285');
    expect(result.html).toContain('USD');
  });

  it('includes airline in HTML', () => {
    const result = formatEmail(baseAlert, 'Test');
    expect(result.html).toContain('LATAM');
  });

  it('includes airports in HTML', () => {
    const result = formatEmail(baseAlert, 'Test');
    expect(result.html).toContain('SCL');
    expect(result.html).toContain('MAD');
  });

  it('includes dates in HTML', () => {
    const result = formatEmail(baseAlert, 'Test');
    expect(result.html).toContain('2026-06-15');
    expect(result.html).toContain('2026-07-15');
  });

  it('includes score breakdown in HTML', () => {
    const result = formatEmail(baseAlert, 'Test');
    expect(result.html).toContain('precio=90');
    expect(result.html).toContain('horario=80');
  });

  it('includes booking button with URL', () => {
    const result = formatEmail(baseAlert, 'Test');
    expect(result.html).toContain('https://booking.example.com/flight-123');
  });

  it('includes stopover row when present', () => {
    const alert: AlertJob = {
      ...baseAlert,
      flightSummary: {
        ...baseAlert.flightSummary,
        stopoverAirport: 'GRU',
        stopoverDurationDays: 3,
      },
    };
    const result = formatEmail(alert, 'Test');
    expect(result.html).toContain('GRU');
    expect(result.html).toContain('3 días');
  });

  it('does not include stopover row when absent', () => {
    const result = formatEmail(baseAlert, 'Test');
    expect(result.html).not.toContain('Stopover');
  });

  it('uses urgent color styling for urgent alerts', () => {
    const result = formatEmail(baseAlert, 'Test');
    expect(result.html).toContain('#c0392b');
  });

  it('uses non-urgent color styling for good alerts', () => {
    const alert: AlertJob = { ...baseAlert, level: 'good' };
    const result = formatEmail(alert, 'Test');
    expect(result.html).toContain('#2980b9');
  });
});

describe('formatEmail — combo (split mode)', () => {
  const comboAlert: AlertJob = {
    searchId: 'search-1',
    flightResultId: 'result-1',
    level: 'good',
    score: 72,
    scoreBreakdown: { price: 75, schedule: 50, stopover: 50, airline: 50, flexibility: 50 },
    flightSummary: {
      price: 300,
      currency: 'USD',
      airline: 'LATAM',
      departureAirport: 'BUE',
      arrivalAirport: 'CUZ',
      departureTime: '2026-07-25T10:00:00.000Z',
      arrivalTime: '2026-07-25T18:00:00.000Z',
      bookingUrl: 'https://booking.example.com/leg1',
    },
    combo: {
      totalPrice: 550,
      legs: [
        {
          price: 300,
          currency: 'USD',
          airline: 'LATAM',
          departureAirport: 'BUE',
          arrivalAirport: 'CUZ',
          departureTime: '2026-07-25T10:00:00.000Z',
          arrivalTime: '2026-07-25T18:00:00.000Z',
          bookingUrl: 'https://booking.example.com/leg1',
        },
        {
          price: 250,
          currency: 'USD',
          airline: 'Avianca',
          departureAirport: 'CUZ',
          arrivalAirport: 'BUE',
          departureTime: '2026-08-15T09:00:00.000Z',
          arrivalTime: '2026-08-15T17:00:00.000Z',
          bookingUrl: 'https://booking.example.com/leg2',
          stopoverAirport: 'LIM',
          stopoverDurationDays: 3,
        },
      ],
    },
  };

  it('renders total price in subject for combo', () => {
    const result = formatEmail(comboAlert, 'Split Test');
    expect(result.subject).toContain('550');
    expect(result.subject).toContain('total');
    expect(result.subject).toContain('Split Test');
  });

  it('renders both leg booking links in html', () => {
    const result = formatEmail(comboAlert, 'Split Test');
    expect(result.html).toContain('https://booking.example.com/leg1');
    expect(result.html).toContain('https://booking.example.com/leg2');
  });

  it('renders leg stopover when present', () => {
    const result = formatEmail(comboAlert, 'Split Test');
    expect(result.html).toContain('LIM');
    expect(result.html).toContain('3 días');
  });

  it('renders both airlines', () => {
    const result = formatEmail(comboAlert, 'Split Test');
    expect(result.html).toContain('LATAM');
    expect(result.html).toContain('Avianca');
  });

  it('labels as split (combinación) in html', () => {
    const result = formatEmail(comboAlert, 'Split Test');
    expect(result.html).toContain('Combinaci');
  });
});
