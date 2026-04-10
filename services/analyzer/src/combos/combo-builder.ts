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
 * Generates all valid combinations (Cartesian product) of flight results per leg,
 * respecting temporal constraints: leg[i+1].outbound.departure must be after leg[i].outbound.departure.
 * Caps input at top N per leg by price (default 5) to limit combinations.
 */
export function buildCombos(
  legResults: FlightResult[][],
  topN = 5,
): FlightResult[][] {
  if (legResults.length === 0) return [];

  // Limit each leg to top N cheapest results
  const capped = legResults.map((results) =>
    [...results]
      .sort((a, b) => a.totalPrice - b.totalPrice)
      .slice(0, topN),
  );

  // Cartesian product with temporal constraint
  function cartesian(legs: FlightResult[][], current: FlightResult[]): FlightResult[][] {
    const idx = current.length;
    if (idx === legs.length) return [current];

    const combos: FlightResult[][] = [];
    for (const candidate of legs[idx]) {
      if (idx > 0) {
        const prevDep = new Date(current[idx - 1].outbound.departure.time);
        const thisDep = new Date(candidate.outbound.departure.time);
        // Require this leg's departure to be strictly after previous leg's departure
        if (thisDep <= prevDep) continue;
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
