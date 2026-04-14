import { describe, it, expect } from 'vitest';
import { buildDespegarLegUrl } from '../../src/utils/despegar.js';

describe('buildDespegarLegUrl', () => {
  it('builds a one-way URL with origin, destination, date, and passengers', () => {
    const url = buildDespegarLegUrl('BUE', 'CUZ', '2026-08-04T09:25:00.000Z', 2);
    expect(url).toBe(
      'https://www.despegar.com.ar/shop/flights/results/one-way/BUE/CUZ/2026-08-04/2/0/0',
    );
  });

  it('builds a URL for 1 passenger', () => {
    const url = buildDespegarLegUrl('EZE', 'MAD', '2026-12-15T10:00:00.000Z', 1);
    expect(url).toBe(
      'https://www.despegar.com.ar/shop/flights/results/one-way/EZE/MAD/2026-12-15/1/0/0',
    );
  });

  it('extracts only the date part from ISO timestamps', () => {
    const url = buildDespegarLegUrl('AEP', 'LIM', '2026-07-28T08:40:00.000Z', 3);
    expect(url).toContain('/AEP/LIM/2026-07-28/');
    expect(url).toContain('/3/0/0');
    expect(url).not.toContain('T08:40');
  });
});
