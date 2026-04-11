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
  /** USD price of one 23kg checked bag in basic-economy fare (per pax, per segment). */
  checkedBagUSD: number;
  /** Optional note (e.g. fare class name) for transparency. */
  note?: string;
}

export const DEFAULT_BAGGAGE_POLICIES: Record<string, BaggagePolicy> = {
  // Low-cost / ultra low-cost: charge for carry-on in basic fare
  JetSMART:    { carryOnUSD: 25, checkedBagUSD: 40, note: 'tarifa Smart (básica) cobra carry-on y valija' },
  Sky:         { carryOnUSD: 25, checkedBagUSD: 35, note: 'tarifa Light (básica) cobra carry-on y valija' },
  GOL:         { carryOnUSD: 30, checkedBagUSD: 45, note: 'tarifa Light cobra carry-on' },
  Spirit:      { carryOnUSD: 60, checkedBagUSD: 50, note: 'cobra carry-on y valija en todas las tarifas' },
  Frontier:    { carryOnUSD: 50, checkedBagUSD: 50 },
  Wizz:        { carryOnUSD: 30, checkedBagUSD: 35 },
  Ryanair:     { carryOnUSD: 30, checkedBagUSD: 40 },

  // Full-service o legacy: carry-on típicamente incluído en básica
  LATAM:       { carryOnUSD: 30, checkedBagUSD: 50, note: 'tarifa Basic internacional cobra; otras incluyen' },
  Avianca:     { carryOnUSD: 0,  checkedBagUSD: 50 },
  Copa:        { carryOnUSD: 0,  checkedBagUSD: 60 },
  'Aerolíneas Argentinas': { carryOnUSD: 0, checkedBagUSD: 50 },
  Aerolineas:  { carryOnUSD: 0,  checkedBagUSD: 50 },
  American:    { carryOnUSD: 0,  checkedBagUSD: 75, note: 'Basic Economy USA cobra valija despachada' },
  Delta:       { carryOnUSD: 0,  checkedBagUSD: 75 },
  United:      { carryOnUSD: 0,  checkedBagUSD: 75, note: 'Basic Economy permite personal item solamente' },
  Iberia:      { carryOnUSD: 0,  checkedBagUSD: 60 },
  'Air France':{ carryOnUSD: 0,  checkedBagUSD: 60 },
  KLM:         { carryOnUSD: 0,  checkedBagUSD: 60 },
  Lufthansa:   { carryOnUSD: 0,  checkedBagUSD: 65 },
  Azul:        { carryOnUSD: 0,  checkedBagUSD: 45 },
  JetBlue:     { carryOnUSD: 0,  checkedBagUSD: 35 },
};

// Module-mutable reference; runtime-config loader can swap this in.
let POLICIES: Record<string, BaggagePolicy> = { ...DEFAULT_BAGGAGE_POLICIES };

/** Replace the active policy map (called by the runtime config loader). */
export function setBaggagePolicies(map: Record<string, BaggagePolicy>): void {
  POLICIES = map;
}

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

/**
 * Worst-case checked-bag USD estimate per bag, per passenger, per segment.
 * Returns 0 for unknown airlines (assume included by default; user must verify).
 */
export function estimateCheckedBagUSD(airlineName: string | undefined): number {
  const policy = getBaggagePolicy(airlineName);
  return policy?.checkedBagUSD ?? 0;
}
