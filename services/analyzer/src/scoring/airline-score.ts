import type { SearchFilters } from '@flight-hunter/shared';

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

  let score = 60;

  // Preferred +15 each
  if (filters.airlinePreferred.includes(outboundAirline)) score += 15;
  if (filters.airlinePreferred.includes(inboundAirline)) score += 15;

  // Same airline +10
  if (outboundAirline === inboundAirline) score += 10;

  return Math.min(100, score);
}
