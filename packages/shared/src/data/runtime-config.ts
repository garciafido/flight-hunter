import {
  DEFAULT_BAGGAGE_POLICIES,
  setBaggagePolicies,
  type BaggagePolicy,
} from './baggage-policies.js';
import {
  DEFAULT_AR_TAX_PAIS,
  DEFAULT_AR_TAX_RG5232,
  setArgentineTaxRates,
} from './argentine-taxes.js';

/**
 * Tunables that the user can override at runtime via /system Configuración.
 * Anything not explicitly set falls back to the bundled defaults.
 *
 * The shape lives in the system_settings.runtime_config Json column.
 * Defaults come from this file and the data/* helpers.
 */
export interface RuntimeConfig {
  baggagePolicies: Record<string, BaggagePolicy>;
  argTaxes: { pais: number; rg5232: number };
  // Notifier dedup TTL (milliseconds): how long to suppress re-alerting the same flight.
  notifierDedupTtlMs: number;
  // Notifier cooldown per search (milliseconds): minimum time between alerts of the same search.
  notifierCooldownMs: number;
  // Hard cap on departure dates scraped per (origin, destination) pair.
  scraperMaxDatesPerPair: number;
  // Permutation engine cap on number of waypoints (factorial blowup safety).
  maxWaypoints: number;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  baggagePolicies: { ...DEFAULT_BAGGAGE_POLICIES },
  argTaxes: { pais: DEFAULT_AR_TAX_PAIS, rg5232: DEFAULT_AR_TAX_RG5232 },
  notifierDedupTtlMs: 6 * 60 * 60 * 1000, // 6h
  notifierCooldownMs: 2 * 60 * 60 * 1000, // 2h
  scraperMaxDatesPerPair: 8,
  maxWaypoints: 6,
};

let CURRENT: RuntimeConfig = freeze(DEFAULT_RUNTIME_CONFIG);

function freeze(config: RuntimeConfig): RuntimeConfig {
  return {
    baggagePolicies: { ...config.baggagePolicies },
    argTaxes: { ...config.argTaxes },
    notifierDedupTtlMs: config.notifierDedupTtlMs,
    notifierCooldownMs: config.notifierCooldownMs,
    scraperMaxDatesPerPair: config.scraperMaxDatesPerPair,
    maxWaypoints: config.maxWaypoints,
  };
}

/**
 * Merge a partial override blob (from system_settings.runtime_config) on top
 * of the bundled defaults and apply the result to the active mutable state.
 *
 * The override is shallow-merged at the top level: any key not present in
 * the blob keeps its default. For nested objects (baggagePolicies, argTaxes)
 * the override fully replaces the default if present.
 */
export function applyRuntimeConfig(override: Partial<RuntimeConfig> | null | undefined): RuntimeConfig {
  const merged: RuntimeConfig = {
    baggagePolicies: override?.baggagePolicies ?? { ...DEFAULT_BAGGAGE_POLICIES },
    argTaxes: override?.argTaxes ?? { pais: DEFAULT_AR_TAX_PAIS, rg5232: DEFAULT_AR_TAX_RG5232 },
    notifierDedupTtlMs: override?.notifierDedupTtlMs ?? DEFAULT_RUNTIME_CONFIG.notifierDedupTtlMs,
    notifierCooldownMs: override?.notifierCooldownMs ?? DEFAULT_RUNTIME_CONFIG.notifierCooldownMs,
    scraperMaxDatesPerPair: override?.scraperMaxDatesPerPair ?? DEFAULT_RUNTIME_CONFIG.scraperMaxDatesPerPair,
    maxWaypoints: override?.maxWaypoints ?? DEFAULT_RUNTIME_CONFIG.maxWaypoints,
  };
  CURRENT = freeze(merged);
  // Push to the per-module mutable state so existing helpers work unchanged.
  setBaggagePolicies(CURRENT.baggagePolicies);
  setArgentineTaxRates(CURRENT.argTaxes.pais, CURRENT.argTaxes.rg5232);
  return CURRENT;
}

/** Returns the currently active runtime config (frozen snapshot). */
export function getRuntimeConfig(): RuntimeConfig {
  return CURRENT;
}

/**
 * Background poller. Each tick, fetch the runtime_config column from
 * system_settings and apply it. Designed to be called once at service
 * startup; it returns a stop function.
 *
 * The loader is generic over the prisma client to avoid pulling node-only
 * deps into the shared package's main bundle.
 */
export interface PrismaLike {
  systemSettings: {
    findUnique(args: { where: { id: string } }): Promise<{ runtimeConfig: unknown } | null>;
  };
}

export function startRuntimeConfigPoller(
  prisma: PrismaLike,
  options: { intervalMs?: number; onError?: (err: unknown) => void } = {},
): () => void {
  const intervalMs = options.intervalMs ?? 30_000;
  let stopped = false;

  async function tick(): Promise<void> {
    try {
      const row = await prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
      const override = (row?.runtimeConfig ?? null) as Partial<RuntimeConfig> | null;
      applyRuntimeConfig(override);
    } catch (err) {
      options.onError?.(err);
    }
  }

  // Initial load + recurring poll.
  void tick();
  const handle = setInterval(() => {
    if (!stopped) void tick();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
