import type { FlightResult, SearchConfig } from '@flight-hunter/shared';

export interface ComboScore {
  score: number;
  breakdown: {
    price: number;
    schedule: number;
    stopover: number;
    airline: number;
    flexibility: number;
  };
}

/**
 * Computes the per-leg top-N given a maxCombos cap and leg count.
 * Returns the largest N such that N^legCount <= maxCombos (min 2).
 */
export function topNPerLeg(maxCombos: number, legCount: number): number {
  if (legCount <= 0) return 2;
  return Math.max(2, Math.floor(maxCombos ** (1 / legCount)));
}

/**
 * A gap constraint between two consecutive legs (in days).
 * minDays/maxDays apply to (leg[i+1].departure - leg[i].departure).
 */
export interface GapConstraint {
  minDays: number;
  maxDays: number;
  /** Optional: max hours between previous leg's ARRIVAL and this leg's DEPARTURE. */
  maxHours?: number;
}

export interface BuildCombosOptions {
  /** How many cheapest results to keep per leg (default 5). */
  topN?: number;
  /**
   * Per-position gap constraints. gapConstraints[i] is the constraint
   * BETWEEN leg[i] and leg[i+1]. So an array of length N-1 for N legs.
   * If a slot is missing or null, only the basic strict-temporal-order
   * constraint applies for that gap.
   */
  gapConstraints?: Array<GapConstraint | null>;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Generates all valid combinations (Cartesian product) of flight results per leg,
 * respecting temporal constraints. By default each leg's departure must be
 * strictly after the previous leg's departure. Optional gap constraints can
 * tighten this to a min/max number of days between consecutive legs (used by
 * stopoverPlan to enforce "X days at the stopover city").
 */
export function buildCombos(
  legResults: FlightResult[][],
  topNOrOptions: number | BuildCombosOptions = 5,
): FlightResult[][] {
  if (legResults.length === 0) return [];

  const opts: BuildCombosOptions =
    typeof topNOrOptions === 'number' ? { topN: topNOrOptions } : topNOrOptions;
  const topN = opts.topN ?? 5;
  const gapConstraints = opts.gapConstraints ?? [];

  // Limit each leg to top N cheapest results
  const capped = legResults.map((results) =>
    [...results]
      .sort((a, b) => a.totalPrice - b.totalPrice)
      .slice(0, topN),
  );

  function gapDays(prev: FlightResult, current: FlightResult): number {
    const prevDep = new Date(prev.outbound.departure.time).getTime();
    const thisDep = new Date(current.outbound.departure.time).getTime();
    return Math.round((thisDep - prevDep) / MS_PER_DAY);
  }

  // Cartesian product with temporal constraint
  function cartesian(legs: FlightResult[][], current: FlightResult[]): FlightResult[][] {
    const idx = current.length;
    if (idx === legs.length) return [current];

    const combos: FlightResult[][] = [];
    for (const candidate of legs[idx]) {
      if (idx > 0) {
        const prev = current[idx - 1];
        const prevDepMs = new Date(prev.outbound.departure.time).getTime();
        const thisDepMs = new Date(candidate.outbound.departure.time).getTime();
        // Always require strict temporal order
        if (thisDepMs <= prevDepMs) continue;

        // If a gap constraint is defined for this transition, enforce it
        const constraint = gapConstraints[idx - 1];
        if (constraint) {
          const days = gapDays(prev, candidate);
          if (days < constraint.minDays || days > constraint.maxDays) continue;

          if (constraint.maxHours !== undefined) {
            const prevArrMs = new Date(prev.outbound.arrival.time).getTime();
            const thisDepMs = new Date(candidate.outbound.departure.time).getTime();
            const waitHours = (thisDepMs - prevArrMs) / (60 * 60 * 1000);
            if (waitHours > constraint.maxHours) continue;
          }
        }
      }
      const next = cartesian(legs, [...current, candidate]);
      combos.push(...next);
    }
    return combos;
  }

  return cartesian(capped, []);
}

/**
 * Scores a combo by computing a price score for the total combo price,
 * and averaging per-leg scores weighted by price.
 */
export function scoreCombo(
  combo: FlightResult[],
  search: SearchConfig,
): ComboScore {
  const totalPrice = combo.reduce((sum, r) => {
    const ppp =
      r.pricePer === 'total'
        ? r.totalPrice / r.passengers
        : r.totalPrice;
    return sum + ppp;
  }, 0);

  const maxPrice = search.alertConfig.maxPricePerPerson;

  // Price score: 0 if above max, scales to 100 as price approaches 0
  const priceScore = totalPrice >= maxPrice
    ? 0
    : Math.max(0, Math.round(100 * (1 - totalPrice / maxPrice)));

  // For schedule/stopover/airline: average the per-leg raw scores (50 each as neutral baseline)
  // In reality these would come from scored FlightResult rows; we use 50 as a neutral default
  // since individual scoring happens in the main worker pipeline.
  const scheduleScore = 50;
  const stopoverScore = 50;
  const airlineScore = 50;
  const flexibilityScore = 50;

  const score = Math.round(
    (priceScore * 0.4 +
      scheduleScore * 0.25 +
      stopoverScore * 0.15 +
      airlineScore * 0.1 +
      flexibilityScore * 0.1),
  );

  return {
    score,
    breakdown: {
      price: priceScore,
      schedule: scheduleScore,
      stopover: stopoverScore,
      airline: airlineScore,
      flexibility: flexibilityScore,
    },
  };
}
