import type { Waypoint } from '../types/search.js';
import { getRuntimeConfig } from '../data/runtime-config.js';

export interface LegPair {
  origin: string;
  destination: string;
}

export interface GapConstraint {
  minDays: number;
  maxDays: number;
  maxHours?: number;
}

export interface LegSequence {
  legs: LegPair[];                  // length = waypoints.length + 1
  gapConstraints: GapConstraint[];  // length = waypoints.length
}

function permute<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const sub of permute(rest)) {
      out.push([arr[i], ...sub]);
    }
  }
  return out;
}

function gapFromWaypoint(wp: Waypoint): GapConstraint {
  if (wp.gap.type === 'stay') {
    return { minDays: wp.gap.minDays, maxDays: wp.gap.maxDays };
  }
  return {
    minDays: 0,
    maxDays: Math.ceil(wp.gap.maxHours / 24),
    maxHours: wp.gap.maxHours,
  };
}

export function enumerateLegSequences(
  origin: string,
  waypoints: Waypoint[],
): LegSequence[] {
  if (waypoints.length === 0) {
    throw new Error('enumerateLegSequences: at least one waypoint is required');
  }
  const maxWaypoints = getRuntimeConfig().maxWaypoints;
  if (waypoints.length > maxWaypoints) {
    throw new Error(`enumerateLegSequences: too many waypoints (${waypoints.length} > ${maxWaypoints})`);
  }

  const firstPinned = waypoints.filter((w) => w.pin === 'first');
  const lastPinned = waypoints.filter((w) => w.pin === 'last');
  if (firstPinned.length > 1) {
    throw new Error('enumerateLegSequences: multiple waypoints pinned as first');
  }
  if (lastPinned.length > 1) {
    throw new Error('enumerateLegSequences: multiple waypoints pinned as last');
  }

  const free = waypoints.filter((w) => w.pin === undefined);
  const firsts = firstPinned;
  const lasts = lastPinned;

  const freePerms = free.length === 0 ? [[]] : permute(free);

  return freePerms.map((perm) => {
    const ordered: Waypoint[] = [...firsts, ...perm, ...lasts];
    const legs: LegPair[] = [];
    let prev = origin;
    for (const wp of ordered) {
      legs.push({ origin: prev, destination: wp.airport });
      prev = wp.airport;
    }
    legs.push({ origin: prev, destination: origin });
    const gapConstraints = ordered.map(gapFromWaypoint);
    return { legs, gapConstraints };
  });
}
