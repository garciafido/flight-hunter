import { describe, it, expect } from 'vitest';
import { normalizePricePerPerson } from '../src/utils/currency.js';

describe('normalizePricePerPerson', () => {
  it('returns price as-is when pricePer is person', () => {
    expect(normalizePricePerPerson(500, 'person', 2)).toBe(500);
  });

  it('returns price as-is for single passenger with pricePer person', () => {
    expect(normalizePricePerPerson(750, 'person', 1)).toBe(750);
  });

  it('divides total price by number of passengers', () => {
    expect(normalizePricePerPerson(1000, 'total', 2)).toBe(500);
  });

  it('divides total price for single passenger (returns same value)', () => {
    expect(normalizePricePerPerson(850, 'total', 1)).toBe(850);
  });

  it('divides total price for 3 passengers', () => {
    expect(normalizePricePerPerson(900, 'total', 3)).toBe(300);
  });

  it('rounds result to 2 decimal places', () => {
    // 100 / 3 = 33.333... -> rounds to 33.33
    expect(normalizePricePerPerson(100, 'total', 3)).toBe(33.33);
  });

  it('rounds correctly for larger values', () => {
    // 1000 / 7 = 142.857... -> rounds to 142.86
    expect(normalizePricePerPerson(1000, 'total', 7)).toBe(142.86);
  });

  it('handles zero price', () => {
    expect(normalizePricePerPerson(0, 'total', 2)).toBe(0);
    expect(normalizePricePerPerson(0, 'person', 2)).toBe(0);
  });
});
