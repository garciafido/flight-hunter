/* v8 ignore next */
export function normalizePricePerPerson(
  price: number,
  pricePer: 'person' | 'total',
  passengers: number,
): number {
  if (pricePer === 'person') return price;
  return Math.round((price / passengers) * 100) / 100;
}
