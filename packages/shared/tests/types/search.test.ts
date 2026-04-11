import { describe, it, expect } from 'vitest';
import type { Waypoint, WaypointGap } from '../../src/types/search.js';

describe('Waypoint types', () => {
  it('accepts a stay gap', () => {
    const wp: Waypoint = {
      airport: 'LIM',
      gap: { type: 'stay', minDays: 3, maxDays: 4 },
    };
    expect(wp.gap.type).toBe('stay');
  });

  it('accepts a connection gap', () => {
    const wp: Waypoint = {
      airport: 'GRU',
      gap: { type: 'connection', maxHours: 5 },
    };
    expect(wp.gap.type).toBe('connection');
  });

  it('discriminates correctly', () => {
    const gap: WaypointGap = { type: 'stay', minDays: 1, maxDays: 2 };
    if (gap.type === 'stay') {
      expect(gap.minDays).toBe(1);
    }
  });
});
