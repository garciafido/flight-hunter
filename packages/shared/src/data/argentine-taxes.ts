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
 * Update if the rates change.
 */
export const AR_TAX_PAIS = 0.30;
export const AR_TAX_RG5232 = 0.45;
export const AR_TAX_MULTIPLIER = 1 + AR_TAX_PAIS + AR_TAX_RG5232; // 1.75

/**
 * Returns the estimated total in USD for a foreign-currency purchase paid
 * from Argentina with an AR card. Rounded to the nearest whole USD.
 */
export function estimateArgentineTotalUSD(googleUSD: number): number {
  return Math.round(googleUSD * AR_TAX_MULTIPLIER);
}
