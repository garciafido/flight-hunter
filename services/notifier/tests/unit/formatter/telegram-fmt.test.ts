import { describe, it, expect } from 'vitest';
import { formatTelegram } from '../../../src/formatter/telegram-fmt.js';
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

describe('formatTelegram', () => {
  it('formats urgent alert with OFERTA URGENTE header', () => {
    const result = formatTelegram(baseAlert, 'Vacaciones Europa');
    expect(result).toContain('OFERTA URGENTE');
    expect(result).toContain('Vacaciones Europa');
  });

  it('formats good alert with BUENA OFERTA header', () => {
    const alert: AlertJob = { ...baseAlert, level: 'good' };
    const result = formatTelegram(alert, 'Test');
    expect(result).toContain('BUENA OFERTA');
  });

  it('formats info alert with Info header', () => {
    const alert: AlertJob = { ...baseAlert, level: 'info' };
    const result = formatTelegram(alert, 'Test');
    expect(result).toContain('Info');
  });

  it('includes price per persona', () => {
    const result = formatTelegram(baseAlert, 'Test');
    expect(result).toContain('USD 285/persona');
  });

  it('includes score', () => {
    const result = formatTelegram(baseAlert, 'Test');
    expect(result).toContain('87/100');
  });

  it('includes airline', () => {
    const result = formatTelegram(baseAlert, 'Test');
    expect(result).toContain('LATAM');
  });

  it('includes airports', () => {
    const result = formatTelegram(baseAlert, 'Test');
    expect(result).toContain('SCL');
    expect(result).toContain('MAD');
  });

  it('includes departure and arrival dates', () => {
    const result = formatTelegram(baseAlert, 'Test');
    expect(result).toContain('2026-06-15');
    expect(result).toContain('2026-07-15');
  });

  it('includes booking URL', () => {
    const result = formatTelegram(baseAlert, 'Test');
    expect(result).toContain('https://booking.example.com/flight-123');
  });

  it('includes score breakdown', () => {
    const result = formatTelegram(baseAlert, 'Test');
    expect(result).toContain('precio=90');
    expect(result).toContain('horario=80');
  });

  it('includes stopover info when present', () => {
    const alert: AlertJob = {
      ...baseAlert,
      flightSummary: {
        ...baseAlert.flightSummary,
        stopoverAirport: 'GRU',
        stopoverDurationDays: 2,
      },
    };
    const result = formatTelegram(alert, 'Test');
    expect(result).toContain('GRU');
    expect(result).toContain('2 días');
  });

  it('does not include stopover section when absent', () => {
    const result = formatTelegram(baseAlert, 'Test');
    expect(result).not.toContain('Stopover');
  });
});

describe('formatTelegram — combo (split mode)', () => {
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

  it('shows total price in combo message', () => {
    const result = formatTelegram(comboAlert, 'Split Test');
    expect(result).toContain('550');
    expect(result).toContain('combinaci');
  });

  it('lists both legs with airports', () => {
    const result = formatTelegram(comboAlert, 'Split Test');
    expect(result).toContain('BUE');
    expect(result).toContain('CUZ');
    expect(result).toContain('Tramo 1');
    expect(result).toContain('Tramo 2');
  });

  it('includes booking links for each leg', () => {
    const result = formatTelegram(comboAlert, 'Split Test');
    expect(result).toContain('https://booking.example.com/leg1');
    expect(result).toContain('https://booking.example.com/leg2');
  });

  it('shows stopover info for legs that have it', () => {
    const result = formatTelegram(comboAlert, 'Split Test');
    expect(result).toContain('LIM');
    expect(result).toContain('3 días');
  });

  it('includes score', () => {
    const result = formatTelegram(comboAlert, 'Split Test');
    expect(result).toContain('72/100');
  });
});
