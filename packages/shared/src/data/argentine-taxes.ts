/**
 * Estimated Argentine tax/levy multiplier on foreign-currency purchases.
 *
 * Components (as of late 2025 / early 2026):
 *   - Impuesto PAIS:                    30%
 *   - Percepción RG 5232 (Ganancias):   45%
 *
 * Total surcharge: 75% on top of the foreign-currency price.
 *
 * APPLIES when paying with an Argentine credit/debit card from Argentina.
 * DOES NOT apply when paying:
 *   - in cash
 *   - with a foreign card
 *   - as a non-resident tourist
 *   - in ARS via local pricing
 *
 * The runtime-config loader can override these via setArgentineTaxRates().
 */
export const DEFAULT_AR_TAX_PAIS = 0.30;
export const DEFAULT_AR_TAX_RG5232 = 0.45;

let AR_TAX_PAIS = DEFAULT_AR_TAX_PAIS;
let AR_TAX_RG5232 = DEFAULT_AR_TAX_RG5232;

/** Total multiplier (1 + sum of rates). Recomputed on every read. */
export function getArgentineTaxMultiplier(): number {
  return 1 + AR_TAX_PAIS + AR_TAX_RG5232;
}

/** Replace the active tax rates (called by the runtime config loader). */
export function setArgentineTaxRates(pais: number, rg5232: number): void {
  AR_TAX_PAIS = pais;
  AR_TAX_RG5232 = rg5232;
}

export function getArgentineTaxRates(): { pais: number; rg5232: number } {
  return { pais: AR_TAX_PAIS, rg5232: AR_TAX_RG5232 };
}

/**
 * Returns the estimated total in USD for a foreign-currency purchase paid
 * from Argentina with an AR card. Rounded to the nearest whole USD.
 */
export function estimateArgentineTotalUSD(googleUSD: number): number {
  return Math.round(googleUSD * getArgentineTaxMultiplier());
}
