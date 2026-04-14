/**
 * Build a Despegar.com one-way flight search URL for a single leg.
 * Opens the results page with origin, destination, date, and passengers.
 *
 * Format: /shop/flights/results/one-way/{ORIGIN}/{DEST}/{YYYY-MM-DD}/{adults}/{children}/{infants}
 */
export function buildDespegarLegUrl(
  origin: string,
  destination: string,
  departureTime: string,
  passengers: number,
): string {
  const date = departureTime.slice(0, 10);
  return `https://www.despegar.com.ar/shop/flights/results/one-way/${origin}/${destination}/${date}/${passengers}/0/0`;
}
