/**
 * Build a Despegar.com multidestino (multi-city) URL for a combo of flights.
 * The URL opens a search with all legs, dates, and passenger count pre-filled.
 *
 * Format: /shop/flights/results/multicity/{ORIGIN/DEST/DATE}.../{adults}/{children}/{infants}
 */
export function buildDespegarUrl(
  legs: Array<{ departureAirport: string; arrivalAirport: string; departureTime: string }>,
  passengers: number,
): string {
  const legSegments = legs
    .map((l) => {
      const date = l.departureTime.slice(0, 10); // YYYY-MM-DD
      return `${l.departureAirport}/${l.arrivalAirport}/${date}`;
    })
    .join('/');
  return `https://www.despegar.com.ar/shop/flights/results/multicity/${legSegments}/${passengers}/0/0`;
}
