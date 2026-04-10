import type { SearchFilters } from '@flight-hunter/shared';
import { getAirlineRating } from '@flight-hunter/shared';

export function computeAirlineScore(
  outboundAirline: string,
  inboundAirline: string,
  filters: Pick<SearchFilters, 'airlineBlacklist' | 'airlinePreferred'>,
): number {
  // Blacklisted → 0
  if (
    filters.airlineBlacklist.includes(outboundAirline) ||
    filters.airlineBlacklist.includes(inboundAirline)
  ) {
    return 0;
  }

  const outRating = getAirlineRating(outboundAirline);
  const inRating = getAirlineRating(inboundAirline);

  // If both airlines are unknown, fall back to legacy behavior
  if (!outRating && !inRating) {
    let score = 60;
    if (filters.airlinePreferred.includes(outboundAirline)) score += 15;
    if (filters.airlinePreferred.includes(inboundAirline)) score += 15;
    if (outboundAirline === inboundAirline) score += 10;
    return Math.min(100, score);
  }

  // Enriched scoring: for each leg compute component score
  const outScore = legScore(outboundAirline, outRating, filters);
  const inScore = legScore(inboundAirline, inRating, filters);
  const base = (outScore + inScore) / 2;

  // Same airline bonus (5 points when on enriched path)
  const sameBonus = outboundAirline === inboundAirline ? 5 : 0;

  return Math.min(100, Math.round(base + sameBonus));
}

function legScore(
  iata: string,
  rating: ReturnType<typeof getAirlineRating>,
  filters: Pick<SearchFilters, 'airlineBlacklist' | 'airlinePreferred'>,
): number {
  if (!rating) {
    // Unknown leg within a mixed pair: use legacy-style fallback for this leg
    let s = 60;
    if (filters.airlinePreferred.includes(iata)) s += 15;
    return s;
  }

  const baggageScore =
    rating.baggageCarryOn === 'included' ? 100 : rating.baggageCarryOn === 'paid' ? 50 : 0;
  const preferredBonus = filters.airlinePreferred.includes(iata) ? 100 : 0;

  // rating(40%) + punctuality(30%) + preferred bonus(20%) + baggage(10%)
  return 0.4 * rating.rating + 0.3 * rating.punctuality + 0.2 * preferredBonus + 0.1 * baggageScore;
}
