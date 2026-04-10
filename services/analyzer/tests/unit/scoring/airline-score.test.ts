import { describe, it, expect } from 'vitest';
import { computeAirlineScore } from '../../../src/scoring/airline-score.js';

// Unknown airlines (not in AIRLINE_RATINGS) for legacy-fallback tests
const unknownFilters = {
  airlineBlacklist: [],
  airlinePreferred: [],
};

describe('computeAirlineScore — blacklist', () => {
  it('returns 0 if outbound airline is blacklisted', () => {
    expect(
      computeAirlineScore('RyanAir', 'LA', {
        airlineBlacklist: ['RyanAir'],
        airlinePreferred: [],
      }),
    ).toBe(0);
  });

  it('returns 0 if inbound airline is blacklisted', () => {
    expect(
      computeAirlineScore('LA', 'RyanAir', {
        airlineBlacklist: ['RyanAir'],
        airlinePreferred: [],
      }),
    ).toBe(0);
  });
});

describe('computeAirlineScore — legacy fallback (unknown airlines)', () => {
  it('returns base score 60 for two unknown neutral airlines', () => {
    expect(computeAirlineScore('ZZ', 'YY', unknownFilters)).toBe(60);
  });

  it('adds +15 for preferred unknown outbound airline', () => {
    expect(
      computeAirlineScore('ZZ', 'YY', { airlineBlacklist: [], airlinePreferred: ['ZZ'] }),
    ).toBe(75);
  });

  it('adds +15 for preferred unknown inbound airline', () => {
    expect(
      computeAirlineScore('ZZ', 'YY', { airlineBlacklist: [], airlinePreferred: ['YY'] }),
    ).toBe(75);
  });

  it('adds +30 for both preferred unknown airlines', () => {
    expect(
      computeAirlineScore('ZZ', 'YY', { airlineBlacklist: [], airlinePreferred: ['ZZ', 'YY'] }),
    ).toBe(90);
  });

  it('adds +10 for same unknown airline on outbound and inbound', () => {
    expect(computeAirlineScore('ZZ', 'ZZ', unknownFilters)).toBe(70);
  });

  it('caps legacy score at 100', () => {
    const score = computeAirlineScore('ZZ', 'ZZ', {
      airlineBlacklist: [],
      airlinePreferred: ['ZZ'],
    });
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('computeAirlineScore — enriched path (known airlines)', () => {
  it('returns enriched score for two known neutral airlines (AA + UA)', () => {
    // AA: 0.4*75 + 0.3*80 + 0 + 0.1*100 = 64; UA: 0.4*73 + 0.3*78 + 0 + 0.1*100 = 62.6
    // avg = 63.3 → round(63.3) = 63
    expect(computeAirlineScore('AA', 'UA', unknownFilters)).toBe(63);
  });

  it('applies preferred bonus to known outbound airline', () => {
    // LA preferred: 0.4*78 + 0.3*82 + 0.2*100 + 0.1*100 = 31.2+24.6+20+10 = 85.8
    // UA not preferred: 62.6
    // avg = (85.8+62.6)/2 = 74.2 → 74
    expect(
      computeAirlineScore('LA', 'UA', { airlineBlacklist: [], airlinePreferred: ['LA'] }),
    ).toBe(74);
  });

  it('applies preferred bonus to known inbound airline', () => {
    // AA not preferred: 64
    // LA preferred: 85.8
    // avg = (64+85.8)/2 = 74.9 → 75
    expect(
      computeAirlineScore('AA', 'LA', { airlineBlacklist: [], airlinePreferred: ['LA'] }),
    ).toBe(75);
  });

  it('applies preferred bonus + same airline bonus for known airline', () => {
    // LA preferred both: 85.8 each, avg=85.8, +5 same = 90.8 → 91
    expect(
      computeAirlineScore('LA', 'LA', { airlineBlacklist: [], airlinePreferred: ['LA'] }),
    ).toBe(91);
  });

  it('applies same airline bonus (+5) for two identical known airlines', () => {
    // AA same: avg(64,64)+5 = 69
    expect(computeAirlineScore('AA', 'AA', unknownFilters)).toBe(69);
  });

  it('applies preferred bonus to both known airlines', () => {
    // AA pref: 0.4*75+0.3*80+0.2*100+0.1*100 = 84; UA pref: 0.4*73+0.3*78+0.2*100+0.1*100=82.6
    // avg = (84+82.6)/2 = 83.3 → 83
    expect(
      computeAirlineScore('AA', 'UA', { airlineBlacklist: [], airlinePreferred: ['AA', 'UA'] }),
    ).toBe(83);
  });

  it('caps enriched score at 100', () => {
    const score = computeAirlineScore('DL', 'DL', {
      airlineBlacklist: [],
      airlinePreferred: ['DL'],
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  it('reflects restricted baggage (JetSMART) as lower score', () => {
    // JA restricted: 0.4*60 + 0.3*70 + 0 + 0.1*0 = 24+21+0+0 = 45; same airline bonus +5
    // avg(45,45)+5 = 50
    const score = computeAirlineScore('JA', 'JA', unknownFilters);
    expect(score).toBe(50);
  });

  it('Delta has higher score than JetSMART (better rating + punctuality + baggage)', () => {
    const dlScore = computeAirlineScore('DL', 'DL', unknownFilters);
    const jaScore = computeAirlineScore('JA', 'JA', unknownFilters);
    expect(dlScore).toBeGreaterThan(jaScore);
  });

  it('handles mixed known/unknown airlines (one leg each)', () => {
    // LA known, ZZ unknown: legScore(LA)=65.8, legScore(ZZ)=60; avg=62.9 → 63
    const score = computeAirlineScore('LA', 'ZZ', unknownFilters);
    expect(score).toBe(63);
  });

  it('applies preferred bonus to unknown leg in mixed pair', () => {
    // LA known, ZZ unknown but preferred: legScore(LA)=65.8, legScore(ZZ pref)=75; avg=70.4 → 70
    const score = computeAirlineScore('LA', 'ZZ', { airlineBlacklist: [], airlinePreferred: ['ZZ'] });
    expect(score).toBe(70);
  });

  it('baggage paid (50 points) reflects intermediate score for airline with paid carry-on (Spirit)', () => {
    // NK Spirit: baggageCarryOn='paid' → baggage score 50
    // 0.4*55 + 0.3*68 + 0 + 0.1*50 = 22 + 20.4 + 0 + 5 = 47.4 per leg, avg(47.4, 47.4)+5 = 52
    const nkScore = computeAirlineScore('NK', 'NK', unknownFilters);
    const aaScore = computeAirlineScore('AA', 'AA', unknownFilters); // included → 100 baggage
    const jaScore = computeAirlineScore('JA', 'JA', unknownFilters); // restricted → 0 baggage
    // NK (paid) should be between JA (restricted) and AA (included)
    expect(nkScore).toBeGreaterThan(jaScore);
    expect(nkScore).toBeLessThan(aaScore);
  });
});
