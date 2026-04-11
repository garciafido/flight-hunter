import type { StopoverInfo } from '@flight-hunter/shared';

/**
 * Per-leg stopover score. In the waypoint trip model, intermediate stays
 * are enforced by the combo builder via gap constraints, not at the per-leg
 * score level. This function only judges whether a single scraped flight
 * has an unexpected stopover that should be penalized.
 *
 * - No stopover → 100 (clean, perfect)
 * - Has stopover → 100 (bonus or expected; don't penalize at this level)
 */
export function computeStopoverScore(stopover?: StopoverInfo): number {
  if (!stopover) return 100;
  return 100;
}
