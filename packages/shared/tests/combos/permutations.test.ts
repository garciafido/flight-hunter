import { describe, it, expect } from 'vitest';
import { enumerateLegSequences } from '../../src/combos/permutations.js';
import type { Waypoint } from '../../src/types/search.js';

const stay = (airport: string, minDays: number, maxDays: number, pin?: 'first' | 'last'): Waypoint => ({
  airport,
  gap: { type: 'stay', minDays, maxDays },
  ...(pin ? { pin } : {}),
});

const connection = (airport: string, maxHours: number, pin?: 'first' | 'last'): Waypoint => ({
  airport,
  gap: { type: 'connection', maxHours },
  ...(pin ? { pin } : {}),
});

describe('enumerateLegSequences', () => {
  it('returns one sequence for a single waypoint', () => {
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

  it('returns 2 sequences for 2 unpinned waypoints', () => {
    const seqs = enumerateLegSequences('BUE', [
      stay('LIM', 3, 4),
      stay('CUZ', 7, 10),
    ]);
    expect(seqs).toHaveLength(2);
    const airports = seqs.map((s) => s.legs.map((l) => l.destination));
    expect(airports).toContainEqual(['LIM', 'CUZ', 'BUE']);
    expect(airports).toContainEqual(['CUZ', 'LIM', 'BUE']);
  });

  it('respects pin: first', () => {
    const seqs = enumerateLegSequences('BUE', [
      stay('LIM', 3, 4, 'first'),
      stay('CUZ', 7, 10),
      stay('MEX', 2, 3),
    ]);
    // LIM must always be first; CUZ and MEX permute (2 sequences)
    expect(seqs).toHaveLength(2);
    seqs.forEach((s) => expect(s.legs[0].destination).toBe('LIM'));
  });

  it('respects pin: last', () => {
    const seqs = enumerateLegSequences('BUE', [
      stay('LIM', 3, 4),
      stay('CUZ', 7, 10, 'last'),
    ]);
    expect(seqs).toHaveLength(1);
    expect(seqs[0].legs.map((l) => l.destination)).toEqual(['LIM', 'CUZ', 'BUE']);
  });

  it('respects pin: first AND pin: last simultaneously', () => {
    const seqs = enumerateLegSequences('BUE', [
      stay('A', 1, 2, 'first'),
      stay('B', 1, 2),
      stay('C', 1, 2, 'last'),
    ]);
    expect(seqs).toHaveLength(1);
    expect(seqs[0].legs.map((l) => l.destination)).toEqual(['A', 'B', 'C', 'BUE']);
  });

  it('throws on conflicting pins (two firsts)', () => {
    expect(() =>
      enumerateLegSequences('BUE', [
        stay('A', 1, 2, 'first'),
        stay('B', 1, 2, 'first'),
      ]),
    ).toThrow(/multiple .* first/i);
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
