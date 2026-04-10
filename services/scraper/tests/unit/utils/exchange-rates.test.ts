import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getExchangeRate,
  convertToUsd,
  resetCache,
  injectCache,
} from '../../../src/utils/exchange-rates.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  resetCache();
});

describe('getExchangeRate', () => {
  it('returns 1 for same currency', async () => {
    const rate = await getExchangeRate('USD', 'USD');
    expect(rate).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches rates on first call', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ rates: { EUR: 0.9, ARS: 900 } }),
    });

    const rate = await getExchangeRate('EUR', 'USD');
    // rate[EUR] = 0.9, rate[USD] = 1, so EUR→USD = 1/0.9 ≈ 1.111
    expect(rate).toBeCloseTo(1 / 0.9, 5);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses cached rates on second call', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ rates: { EUR: 0.9 } }),
    });

    await getExchangeRate('EUR');
    await getExchangeRate('EUR');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws on unknown currency', async () => {
    injectCache({ EUR: 0.9 });
    await expect(getExchangeRate('XYZ')).rejects.toThrow('Unknown currency');
  });

  it('throws if fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(getExchangeRate('EUR')).rejects.toThrow('Failed to fetch exchange rates');
  });

  it('converts ARS to USD correctly with injected cache', async () => {
    injectCache({ ARS: 900 });
    // ARS→USD: toRate/fromRate = 1/900
    const rate = await getExchangeRate('ARS', 'USD');
    expect(rate).toBeCloseTo(1 / 900, 8);
  });
});

describe('convertToUsd', () => {
  it('converts amount to USD', async () => {
    injectCache({ EUR: 0.9 });
    const usd = await convertToUsd(90, 'EUR');
    // 90 EUR * (1/0.9) = 100 USD
    expect(usd).toBeCloseTo(100, 2);
  });

  it('returns same amount for USD input', async () => {
    const usd = await convertToUsd(100, 'USD');
    expect(usd).toBe(100);
  });
});
