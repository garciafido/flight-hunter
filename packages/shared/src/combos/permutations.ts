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

/**
 * Build the leg sequence from waypoints IN THE ORDER GIVEN.
 *
 * The visual order in the form IS the trip order — no permutations.
 * If the user wants to try a different order, they duplicate the search
 * and reorder the waypoints manually.
 *
 * Returns a single-element array for backwards compatibility with callers
 * that iterate over sequences.
 */
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

  // Build legs: origin → wp[0], wp[0] → wp[1], ..., wp[N-1] → origin
  const legs: LegPair[] = [];
  let prev = origin;
  for (const wp of waypoints) {
    legs.push({ origin: prev, destination: wp.airport });
    prev = wp.airport;
  }
  legs.push({ origin: prev, destination: origin });

  const gapConstraints = waypoints.map(gapFromWaypoint);

  return [{ legs, gapConstraints }];
}
