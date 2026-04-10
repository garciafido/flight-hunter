import { describe, it, expect } from 'vitest';
import { computeScheduleScore } from '../../../src/scoring/schedule-score.js';
import type { FlightLeg } from '@flight-hunter/shared';

function makeLeg(
  depTime: string,
  arrTime: string,
  durationMinutes: number,
  stops: number,
): FlightLeg {
  return {
    departure: { airport: 'SCL', time: depTime },
    arrival: { airport: 'MIA', time: arrTime },
    airline: 'LA',
    flightNumber: 'LA800',
    durationMinutes,
    stops,
  };
}

describe('computeScheduleScore', () => {
  it('returns high score for ideal flights (good time, short, no stops)', () => {
    const outbound = makeLeg('10:00', '14:00', 240, 0);
    const inbound = makeLeg('12:00', '16:00', 240, 0);
    const score = computeScheduleScore(outbound, inbound);
    expect(score).toBeCloseTo(100);
  });

  it('returns lower score for night departure', () => {
    const outbound = makeLeg('02:00', '06:00', 240, 0);
    const inbound = makeLeg('12:00', '16:00', 240, 0);
    const night = computeScheduleScore(outbound, inbound);
    const day = computeScheduleScore(makeLeg('10:00', '14:00', 240, 0), inbound);
    expect(night).toBeLessThan(day);
  });

  it('penalizes long duration', () => {
    const short = makeLeg('10:00', '14:00', 240, 0);
    const long = makeLeg('10:00', '22:00', 720, 0);
    const inbound = makeLeg('12:00', '16:00', 240, 0);
    expect(computeScheduleScore(short, inbound)).toBeGreaterThan(
      computeScheduleScore(long, inbound),
    );
  });

  it('penalizes stops', () => {
    const direct = makeLeg('10:00', '14:00', 240, 0);
    const oneStop = makeLeg('10:00', '14:00', 240, 1);
    const twoStops = makeLeg('10:00', '14:00', 240, 2);
    const inbound = makeLeg('12:00', '16:00', 240, 0);
    expect(computeScheduleScore(direct, inbound)).toBeGreaterThan(
      computeScheduleScore(oneStop, inbound),
    );
    expect(computeScheduleScore(oneStop, inbound)).toBeGreaterThan(
      computeScheduleScore(twoStops, inbound),
    );
  });

  it('averages outbound and inbound scores', () => {
    const good = makeLeg('10:00', '14:00', 240, 0);
    const bad = makeLeg('01:00', '05:00', 720, 2);
    const s1 = computeScheduleScore(good, bad);
    const s2 = computeScheduleScore(bad, good);
    expect(s1).toBeCloseTo(s2);
  });

  it('returns score between 0 and 100', () => {
    const worst = makeLeg('00:00', '23:00', 1440, 10);
    const score = computeScheduleScore(worst, worst);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('handles ISO datetime strings', () => {
    const leg = {
      ...makeLeg('10:00', '14:00', 240, 0),
      departure: { airport: 'SCL', time: '2024-03-15T10:00:00Z' },
      arrival: { airport: 'MIA', time: '2024-03-15T14:00:00Z' },
    };
    const score = computeScheduleScore(leg, leg);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores late arrival lower than good arrival', () => {
    const goodArr = makeLeg('10:00', '14:00', 240, 0);
    const lateArr = makeLeg('10:00', '23:00', 780, 0);
    const inbound = makeLeg('12:00', '16:00', 240, 0);
    expect(computeScheduleScore(goodArr, inbound)).toBeGreaterThan(
      computeScheduleScore(lateArr, inbound),
    );
  });

  it('gives 75 for 1-stop flights in stops component', () => {
    // Direct vs 1-stop: pure stops difference
    const direct = makeLeg('10:00', '14:00', 240, 0);
    const oneStop = makeLeg('10:00', '14:00', 240, 1);
    const inbound = makeLeg('12:00', '16:00', 240, 0);
    const d = computeScheduleScore(direct, inbound);
    const o = computeScheduleScore(oneStop, inbound);
    // stops component: 100 vs 75, weight 30% → difference = 7.5 on each leg, avg'd with same inbound
    // outbound contribution: (100-75)*0.3 = 7.5, averaged with inbound (same) /2 = 3.75
    expect(d - o).toBeCloseTo(3.75);
  });
});
