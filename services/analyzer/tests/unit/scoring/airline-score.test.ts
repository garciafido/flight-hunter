import { describe, it, expect } from 'vitest';
import { computeAirlineScore } from '../../../src/scoring/airline-score.js';

const baseFilters = {
  airlineBlacklist: [],
  airlinePreferred: [],
};

describe('computeAirlineScore', () => {
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

  it('returns base score 60 for neutral airlines', () => {
    expect(computeAirlineScore('AA', 'UA', baseFilters)).toBe(60);
  });

  it('adds +15 for preferred outbound airline', () => {
    expect(
      computeAirlineScore('LA', 'UA', { airlineBlacklist: [], airlinePreferred: ['LA'] }),
    ).toBe(75);
  });

  it('adds +15 for preferred inbound airline', () => {
    expect(
      computeAirlineScore('AA', 'LA', { airlineBlacklist: [], airlinePreferred: ['LA'] }),
    ).toBe(75);
  });

  it('adds +30 for both preferred airlines', () => {
    expect(
      computeAirlineScore('LA', 'LA', { airlineBlacklist: [], airlinePreferred: ['LA'] }),
    ).toBe(100); // 60 + 15 + 15 + 10 = 100, capped at 100
  });

  it('adds +10 for same airline on outbound and inbound', () => {
    expect(computeAirlineScore('AA', 'AA', baseFilters)).toBe(70);
  });

  it('combines preferred and same airline bonuses', () => {
    // 60 + 15 (out pref) + 15 (in pref) + 10 (same) = 100
    const score = computeAirlineScore('LA', 'LA', {
      airlineBlacklist: [],
      airlinePreferred: ['LA'],
    });
    expect(score).toBe(100);
  });

  it('caps score at 100', () => {
    const score = computeAirlineScore('LA', 'LA', {
      airlineBlacklist: [],
      airlinePreferred: ['LA', 'AA'],
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  it('different preferred airlines each get +15', () => {
    // out=AA (pref), in=UA (pref), different → 60+15+15=90, no same-airline bonus
    const score = computeAirlineScore('AA', 'UA', {
      airlineBlacklist: [],
      airlinePreferred: ['AA', 'UA'],
    });
    expect(score).toBe(90);
  });
});
