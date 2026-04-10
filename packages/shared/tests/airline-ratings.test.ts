import { describe, it, expect } from 'vitest';
import { AIRLINE_RATINGS, getAirlineRating } from '../src/data/airline-ratings.js';

describe('AIRLINE_RATINGS dataset', () => {
  it('contains at least 17 airlines', () => {
    expect(Object.keys(AIRLINE_RATINGS).length).toBeGreaterThanOrEqual(17);
  });

  it('all entries have valid rating 0-100', () => {
    for (const airline of Object.values(AIRLINE_RATINGS)) {
      expect(airline.rating).toBeGreaterThanOrEqual(0);
      expect(airline.rating).toBeLessThanOrEqual(100);
    }
  });

  it('all entries have valid punctuality 0-100', () => {
    for (const airline of Object.values(AIRLINE_RATINGS)) {
      expect(airline.punctuality).toBeGreaterThanOrEqual(0);
      expect(airline.punctuality).toBeLessThanOrEqual(100);
    }
  });

  it('all entries have valid baggageCarryOn values', () => {
    const valid = new Set(['included', 'paid', 'restricted']);
    for (const airline of Object.values(AIRLINE_RATINGS)) {
      expect(valid.has(airline.baggageCarryOn)).toBe(true);
    }
  });

  it('all entries have valid changePolicy values', () => {
    const valid = new Set(['free', 'paid', 'no-changes']);
    for (const airline of Object.values(AIRLINE_RATINGS)) {
      expect(valid.has(airline.changePolicy)).toBe(true);
    }
  });

  it('all entries have valid region values', () => {
    const valid = new Set(['latam', 'americas', 'europe', 'asia', 'global']);
    for (const airline of Object.values(AIRLINE_RATINGS)) {
      expect(valid.has(airline.region)).toBe(true);
    }
  });

  it('IATA codes match key names', () => {
    for (const [key, airline] of Object.entries(AIRLINE_RATINGS)) {
      expect(airline.iata).toBe(key);
    }
  });
});

describe('getAirlineRating', () => {
  it('finds airline by exact IATA code', () => {
    const result = getAirlineRating('LA');
    expect(result).toBeDefined();
    expect(result!.iata).toBe('LA');
    expect(result!.name).toBe('LATAM');
  });

  it('finds airline by lowercase IATA code', () => {
    const result = getAirlineRating('la');
    expect(result).toBeDefined();
    expect(result!.iata).toBe('LA');
  });

  it('finds airline by mixed case IATA', () => {
    const result = getAirlineRating('Dl');
    expect(result).toBeDefined();
    expect(result!.iata).toBe('DL');
  });

  it('finds airline by partial name (case-insensitive)', () => {
    const result = getAirlineRating('LATAM');
    expect(result).toBeDefined();
    expect(result!.iata).toBe('LA');
  });

  it('finds airline by lowercase partial name', () => {
    const result = getAirlineRating('lufthansa');
    expect(result).toBeDefined();
    expect(result!.iata).toBe('LH');
  });

  it('finds airline by partial name substring', () => {
    const result = getAirlineRating('copa');
    expect(result).toBeDefined();
    expect(result!.iata).toBe('CM');
  });

  it('returns undefined for unknown IATA code', () => {
    expect(getAirlineRating('ZZ')).toBeUndefined();
  });

  it('returns undefined for unknown name', () => {
    expect(getAirlineRating('NonExistentAirline')).toBeUndefined();
  });

  it('returns correct rating for Delta (free change policy)', () => {
    const result = getAirlineRating('DL');
    expect(result).toBeDefined();
    expect(result!.changePolicy).toBe('free');
    expect(result!.rating).toBe(82);
    expect(result!.punctuality).toBe(85);
  });

  it('returns correct data for JetSMART (restricted baggage)', () => {
    const result = getAirlineRating('JA');
    expect(result).toBeDefined();
    expect(result!.baggageCarryOn).toBe('restricted');
    expect(result!.region).toBe('latam');
  });

  it('returns correct data for Aerolíneas Argentinas', () => {
    const result = getAirlineRating('AR');
    expect(result).toBeDefined();
    expect(result!.name).toBe('Aerolíneas Argentinas');
  });

  it('IATA lookup takes priority over name match', () => {
    // 'AR' is both an IATA code and could match 'Air France' (af) or others by name
    // but 'AA' IATA lookup should return American Airlines, not just name matching
    const result = getAirlineRating('AA');
    expect(result!.iata).toBe('AA');
    expect(result!.name).toBe('American Airlines');
  });

  it('returns correct data for Spirit Airlines (paid baggage, no-changes policy)', () => {
    const result = getAirlineRating('NK');
    expect(result).toBeDefined();
    expect(result!.baggageCarryOn).toBe('paid');
    expect(result!.changePolicy).toBe('no-changes');
    expect(result!.region).toBe('americas');
  });

  it('returns correct data for Ryanair (paid baggage, no-changes policy)', () => {
    const result = getAirlineRating('FR');
    expect(result).toBeDefined();
    expect(result!.name).toBe('Ryanair');
    expect(result!.baggageCarryOn).toBe('paid');
    expect(result!.changePolicy).toBe('no-changes');
    expect(result!.region).toBe('europe');
  });

  it('finds Ryanair by name substring', () => {
    const result = getAirlineRating('ryanair');
    expect(result).toBeDefined();
    expect(result!.iata).toBe('FR');
  });
});
