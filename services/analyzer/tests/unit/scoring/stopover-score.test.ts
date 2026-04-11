import { describe, it, expect } from 'vitest';
import { computeStopoverScore } from '../../../src/scoring/stopover-score.js';
import type { StopoverInfo } from '@flight-hunter/shared';

function makeStopover(airport: string, durationDays: number): StopoverInfo {
  return {
    airport,
    arrivalTime: '2024-03-15T10:00:00Z',
    departureTime: '2024-03-17T10:00:00Z',
    durationDays,
  };
}

describe('computeStopoverScore', () => {
  it('returns 100 when no stopover (clean leg)', () => {
    expect(computeStopoverScore()).toBe(100);
  });

  it('returns 100 when stopover exists (waypoint engine handles validation elsewhere)', () => {
    expect(computeStopoverScore(makeStopover('LIM', 3))).toBe(100);
  });
});
