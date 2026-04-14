import { describe, it, expect } from 'vitest';
import { buildDespegarUrl } from '../../src/utils/despegar.js';

describe('buildDespegarUrl', () => {
  it('builds a multicity URL for 3 legs with 2 passengers', () => {
    const legs = [
      { departureAirport: 'BUE', arrivalAirport: 'CUZ', departureTime: '2026-08-04T09:25:00.000Z' },
      { departureAirport: 'CUZ', arrivalAirport: 'LIM', departureTime: '2026-08-12T21:15:00.000Z' },
      { departureAirport: 'LIM', arrivalAirport: 'BUE', departureTime: '2026-08-16T22:00:00.000Z' },
    ];
    const url = buildDespegarUrl(legs, 2);
    expect(url).toBe(
      'https://www.despegar.com.ar/shop/flights/results/multicity/BUE/CUZ/2026-08-04/CUZ/LIM/2026-08-12/LIM/BUE/2026-08-16/2/0/0',
    );
  });

  it('builds a URL for a single leg with 1 passenger', () => {
    const legs = [
      { departureAirport: 'EZE', arrivalAirport: 'MAD', departureTime: '2026-12-15T10:00:00.000Z' },
    ];
    const url = buildDespegarUrl(legs, 1);
    expect(url).toBe(
      'https://www.despegar.com.ar/shop/flights/results/multicity/EZE/MAD/2026-12-15/1/0/0',
    );
  });

  it('extracts only the date part from ISO timestamps', () => {
    const legs = [
      { departureAirport: 'AEP', arrivalAirport: 'LIM', departureTime: '2026-07-28T08:40:00.000Z' },
    ];
    const url = buildDespegarUrl(legs, 3);
    expect(url).toContain('/AEP/LIM/2026-07-28/');
    expect(url).toContain('/3/0/0');
    expect(url).not.toContain('T08:40');
  });
});
