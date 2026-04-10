import { describe, it, expect } from 'vitest';
import { computeStopoverScore } from '../../../src/scoring/stopover-score.js';
import type { StopoverInfo, StopoverConfig } from '@flight-hunter/shared';

function makeStopover(airport: string, durationDays: number): StopoverInfo {
  return {
    airport,
    arrivalTime: '2024-03-15T10:00:00Z',
    departureTime: '2024-03-17T10:00:00Z',
    durationDays,
  };
}

function makeConfig(airport: string, minDays: number, maxDays: number): StopoverConfig {
  return { airport, minDays, maxDays };
}

describe('computeStopoverScore', () => {
  it('returns 100 when no config and no stopover', () => {
    expect(computeStopoverScore()).toBe(100);
  });

  it('returns 0 when config required but no stopover', () => {
    expect(computeStopoverScore(undefined, makeConfig('NYC', 2, 4))).toBe(0);
  });

  it('returns 100 when no config but stopover exists (bonus)', () => {
    expect(computeStopoverScore(makeStopover('NYC', 3))).toBe(100);
  });

  it('returns 0 for wrong airport', () => {
    expect(
      computeStopoverScore(makeStopover('LAX', 3), makeConfig('NYC', 2, 4)),
    ).toBe(0);
  });

  it('returns 100 when stopover is within range', () => {
    expect(
      computeStopoverScore(makeStopover('NYC', 3), makeConfig('NYC', 2, 4)),
    ).toBe(100);
  });

  it('returns 100 at exact min days', () => {
    expect(
      computeStopoverScore(makeStopover('NYC', 2), makeConfig('NYC', 2, 4)),
    ).toBe(100);
  });

  it('returns 100 at exact max days', () => {
    expect(
      computeStopoverScore(makeStopover('NYC', 4), makeConfig('NYC', 2, 4)),
    ).toBe(100);
  });

  it('penalizes -30/day for shorter than min', () => {
    // 1 day short of min (min=2, got=1) → 100 - 1*30 = 70
    expect(
      computeStopoverScore(makeStopover('NYC', 1), makeConfig('NYC', 2, 4)),
    ).toBe(70);
  });

  it('penalizes -30/day for 2 days short → 40', () => {
    expect(
      computeStopoverScore(makeStopover('NYC', 0), makeConfig('NYC', 2, 4)),
    ).toBe(40);
  });

  it('clamps to 0 when too many short days', () => {
    // 4 days short → 100 - 4*30 = -20 → clamped to 0
    expect(
      computeStopoverScore(makeStopover('NYC', 0), makeConfig('NYC', 5, 7)),
    ).toBe(0);
  });

  it('penalizes -15/day for longer than max', () => {
    // 1 day over max (max=4, got=5) → 100 - 1*15 = 85
    expect(
      computeStopoverScore(makeStopover('NYC', 5), makeConfig('NYC', 2, 4)),
    ).toBe(85);
  });

  it('penalizes -15/day for 2 days over max → 70', () => {
    expect(
      computeStopoverScore(makeStopover('NYC', 6), makeConfig('NYC', 2, 4)),
    ).toBe(70);
  });

  it('clamps to 0 for extreme excess', () => {
    // 10 days over → 100 - 10*15 = -50 → 0
    expect(
      computeStopoverScore(makeStopover('NYC', 14), makeConfig('NYC', 2, 4)),
    ).toBe(0);
  });
});
