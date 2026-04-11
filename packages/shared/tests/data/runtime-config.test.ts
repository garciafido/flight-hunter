import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyRuntimeConfig,
  getRuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
} from '../../src/data/runtime-config.js';
import { estimateCarryOnUSD, estimateCheckedBagUSD } from '../../src/data/baggage-policies.js';
import { estimateArgentineTotalUSD, getArgentineTaxRates } from '../../src/data/argentine-taxes.js';

describe('runtime-config', () => {
  beforeEach(() => {
    applyRuntimeConfig(null); // reset to defaults before each test
  });

  it('returns the bundled defaults when no override is applied', () => {
    const cfg = getRuntimeConfig();
    expect(cfg.argTaxes).toEqual({ pais: 0.30, rg5232: 0.45 });
    expect(cfg.notifierDedupTtlMs).toBe(DEFAULT_RUNTIME_CONFIG.notifierDedupTtlMs);
    expect(cfg.scraperMaxDatesPerPair).toBe(8);
    expect(cfg.maxWaypoints).toBe(6);
    expect(cfg.baggagePolicies['JetSMART']).toBeDefined();
  });

  it('applyRuntimeConfig(null) is a no-op (defaults stay)', () => {
    applyRuntimeConfig(null);
    expect(getRuntimeConfig().argTaxes.pais).toBe(0.30);
    expect(estimateArgentineTotalUSD(100)).toBe(175); // 100 * 1.75
  });

  it('overriding argTaxes recomputes the AR multiplier in helpers', () => {
    applyRuntimeConfig({ argTaxes: { pais: 0.20, rg5232: 0.30 } });
    expect(getArgentineTaxRates()).toEqual({ pais: 0.20, rg5232: 0.30 });
    expect(estimateArgentineTotalUSD(100)).toBe(150); // 100 * 1.50
  });

  it('overriding baggagePolicies replaces the active map for the helpers', () => {
    applyRuntimeConfig({
      baggagePolicies: {
        'TestAir': { carryOnUSD: 99, checkedBagUSD: 88, note: 'test' },
      },
    });
    expect(estimateCarryOnUSD('TestAir')).toBe(99);
    expect(estimateCheckedBagUSD('TestAir')).toBe(88);
    // JetSMART is no longer in the map → 0
    expect(estimateCarryOnUSD('JetSMART')).toBe(0);
  });

  it('partial override only touches the keys present', () => {
    applyRuntimeConfig({ notifierDedupTtlMs: 1000 });
    const cfg = getRuntimeConfig();
    expect(cfg.notifierDedupTtlMs).toBe(1000);
    // The other tunables stay at their defaults
    expect(cfg.scraperMaxDatesPerPair).toBe(8);
    expect(cfg.argTaxes.pais).toBe(0.30);
  });

  it('reset by passing null restores all defaults', () => {
    applyRuntimeConfig({
      argTaxes: { pais: 0.10, rg5232: 0.10 },
      notifierDedupTtlMs: 1000,
    });
    applyRuntimeConfig(null);
    expect(getRuntimeConfig().argTaxes.pais).toBe(0.30);
    expect(getRuntimeConfig().notifierDedupTtlMs).toBe(DEFAULT_RUNTIME_CONFIG.notifierDedupTtlMs);
    expect(estimateCarryOnUSD('JetSMART')).toBe(25); // restored
  });
});
