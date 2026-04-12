import { describe, it, expect } from 'vitest';
import { enumerateLegSequences } from '../../src/combos/permutations.js';
import type { Waypoint } from '../../src/types/search.js';

const stay = (airport: string, minDays: number, maxDays: number): Waypoint => ({
  airport,
  gap: { type: 'stay', minDays, maxDays },
});

const connection = (airport: string, maxHours: number): Waypoint => ({
  airport,
  gap: { type: 'connection', maxHours },
});

describe('enumerateLegSequences', () => {
  it('returns exactly 1 sequence following the given order', () => {
    const seqs = enumerateLegSequences('BUE', [stay('MAD', 5, 10)]);
    expect(seqs).toHaveLength(1);
    expect(seqs[0].legs).toEqual([
      { origin: 'BUE', destination: 'MAD' },
      { origin: 'MAD', destination: 'BUE' },
    ]);
    expect(seqs[0].gapConstraints).toEqual([
      { minDays: 5, maxDays: 10 },
    ]);
  });

  it('preserves form order for 2 waypoints (no permutations)', () => {
    const seqs = enumerateLegSequences('BUE', [
      stay('LIM', 3, 4),
      stay('CUZ', 7, 10),
    ]);
    expect(seqs).toHaveLength(1);
    expect(seqs[0].legs.map((l) => l.destination)).toEqual(['LIM', 'CUZ', 'BUE']);
  });

  it('preserves form order for 3 waypoints (no permutations)', () => {
    const seqs = enumerateLegSequences('BUE', [
      stay('CUZ', 7, 10),
      stay('LIM', 3, 4),
      stay('MEX', 2, 3),
    ]);
    expect(seqs).toHaveLength(1);
    expect(seqs[0].legs.map((l) => l.destination)).toEqual(['CUZ', 'LIM', 'MEX', 'BUE']);
  });

  it('throws on too many waypoints', () => {
    const wps = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((a) => stay(a, 1, 2));
    expect(() => enumerateLegSequences('BUE', wps)).toThrow(/too many/i);
  });

  it('translates connection-type waypoints to gap constraints with maxHours', () => {
    const seqs = enumerateLegSequences('BUE', [connection('GRU', 5)]);
    expect(seqs).toHaveLength(1);
    expect(seqs[0].gapConstraints[0]).toEqual({
      minDays: 0,
      maxDays: 1, // ceil(5/24) = 1
      maxHours: 5,
    });
  });

  it('throws on empty waypoints array', () => {
    expect(() => enumerateLegSequences('BUE', [])).toThrow(/at least one/i);
  });
});
