/**
 * Static carry-on baggage cost estimates per airline (USD).
 *
 * These are WORST-CASE basic-economy fare prices. Higher fare classes
 * (Smart+, Plus, Top, etc.) typically include carry-on for free. Use as
 * an estimate to surface in alerts; verify the exact cost at booking.
 *
 * Sources: airline websites and standard 2025-2026 baggage policies.
 * Update if airlines change their pricing.
 */
export interface BaggagePolicy {
  /** USD price of an 8-10kg carry-on bag in basic-economy fare. 0 = always included. */
  carryOnUSD: number;
  /** Optional note (e.g. fare class name) for transparency. */
  note?: string;
}

const POLICIES: Record<string, BaggagePolicy> = {
  // Low-cost / ultra low-cost: charge for carry-on in basic fare
  JetSMART:    { carryOnUSD: 25, note: 'tarifa Smart (básica) cobra carry-on' },
  Sky:         { carryOnUSD: 25, note: 'tarifa Light (básica) cobra carry-on' },
  GOL:         { carryOnUSD: 30, note: 'tarifa Light cobra carry-on' },
  Spirit:      { carryOnUSD: 60, note: 'cobra carry-on en todas las tarifas' },
  Frontier:    { carryOnUSD: 50 },
  Wizz:        { carryOnUSD: 30 },
  Ryanair:     { carryOnUSD: 30 },

  // Full-service o legacy: carry-on típicamente incluído en básica
  LATAM:       { carryOnUSD: 30, note: 'tarifa Basic internacional cobra carry-on; otras lo incluyen' },
  Avianca:     { carryOnUSD: 0 },
  Copa:        { carryOnUSD: 0 },
  'Aerolíneas Argentinas': { carryOnUSD: 0 },
  Aerolineas:  { carryOnUSD: 0 },
  American:    { carryOnUSD: 0 },
  Delta:       { carryOnUSD: 0 },
  United:      { carryOnUSD: 0, note: 'Basic Economy en USA permite personal item solamente' },
  Iberia:      { carryOnUSD: 0 },
  'Air France':{ carryOnUSD: 0 },
  KLM:         { carryOnUSD: 0 },
  Lufthansa:   { carryOnUSD: 0 },
  Azul:        { carryOnUSD: 0 },
  JetBlue:     { carryOnUSD: 0 },
};

/**
 * Returns the baggage policy for an airline name. Matches case-insensitively
 * against known prefixes/substrings (so "LATAM Airlines" matches "LATAM").
 * Returns null for unknown airlines (caller should treat as "unknown / verify").
 */
export function getBaggagePolicy(airlineName: string | undefined): BaggagePolicy | null {
  if (!airlineName) return null;
  const normalized = airlineName.toLowerCase();
  for (const [key, policy] of Object.entries(POLICIES)) {
    if (normalized.includes(key.toLowerCase())) {
      return policy;
    }
  }
  return null;
}

/**
 * Worst-case carry-on USD estimate. Returns 0 if the airline is known to
 * include carry-on, the estimated price if it charges, or 0 for unknown
 * airlines (assume included by default; user must verify).
 */
export function estimateCarryOnUSD(airlineName: string | undefined): number {
  const policy = getBaggagePolicy(airlineName);
  return policy?.carryOnUSD ?? 0;
}
