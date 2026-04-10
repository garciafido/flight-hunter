const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

interface RateCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

let cache: RateCache | null = null;

export async function getExchangeRate(from: string, to: string = 'USD'): Promise<number> {
  if (from === to) return 1;
  await ensureCache();
  const rates = cache!.rates;
  const fromRate = rates[from.toUpperCase()];
  const toRate = rates[to.toUpperCase()];
  if (!fromRate || !toRate) throw new Error(`Unknown currency: ${from} or ${to}`);
  // rates are relative to USD base: rate[X] = how many X per 1 USD
  // to convert from → to: multiply by toRate/fromRate
  return toRate / fromRate;
}

export async function convertToUsd(amount: number, from: string): Promise<number> {
  const rate = await getExchangeRate(from, 'USD');
  return Math.round(amount * rate * 100) / 100;
}

async function ensureCache(): Promise<void> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return;
  const res = await fetch('https://api.exchangerate.host/latest?base=USD');
  if (!res.ok) throw new Error(`Failed to fetch exchange rates: ${res.status}`);
  const json = (await res.json()) as { rates: Record<string, number> };
  cache = {
    rates: { USD: 1, ...json.rates },
    fetchedAt: Date.now(),
  };
}

/** For testing: reset the cache. */
export function resetCache(): void {
  cache = null;
}

/** For testing: inject a cache directly. */
export function injectCache(rates: Record<string, number>): void {
  cache = { rates: { USD: 1, ...rates }, fetchedAt: Date.now() };
}
