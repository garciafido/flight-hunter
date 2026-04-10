export const REGION_PRESETS: Record<string, string[]> = {
  southAmerica: ['LIM', 'CUZ', 'BOG', 'UIO', 'SAO', 'GIG', 'SCL', 'LPB', 'MVD', 'ASU'],
  europe: ['MAD', 'BCN', 'CDG', 'LHR', 'FRA', 'AMS', 'FCO', 'MXP', 'LIS', 'IST'],
  northAmerica: ['JFK', 'MIA', 'LAX', 'SFO', 'ORD', 'DFW', 'YYZ', 'YUL', 'MEX'],
  asia: ['NRT', 'HND', 'PEK', 'PVG', 'HKG', 'SIN', 'ICN', 'BKK', 'DXB'],
  oceania: ['SYD', 'MEL', 'AKL'],
};

/**
 * Expands a list of destination candidates, replacing any region preset keys
 * with their constituent IATA airport codes. Literal IATA codes are kept as-is.
 * Deduplicates the result.
 */
export function expandDestinationCandidates(candidates: string[]): string[] {
  const expanded = new Set<string>();
  for (const c of candidates) {
    if (REGION_PRESETS[c]) {
      REGION_PRESETS[c].forEach((airport) => expanded.add(airport));
    } else {
      expanded.add(c);
    }
  }
  return Array.from(expanded);
}
