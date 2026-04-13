import type { Queue } from 'bullmq';
import type { SearchConfig, FlightResult } from '@flight-hunter/shared';
import { QUEUE_NAMES, expandDestinationCandidates, enumerateLegSequences } from '@flight-hunter/shared';
import type { VpnRouter } from '../proxy/vpn-router.js';
import type { GoogleFlightsSource } from '../sources/google-flights.js';
import type { ResilienceLayer } from '../resilience/resilience-layer.js';
import { PassthroughResilienceLayer } from '../resilience/resilience-layer.js';

type SearchLegInput = { origin: string; destination: string; departureFrom: Date; departureTo: Date };

export class SearchJobProcessor {
  private readonly resilience: ResilienceLayer;

  constructor(
    private readonly sources: GoogleFlightsSource[],
    private readonly vpnRouter: VpnRouter,
    private readonly rawResultsQueue: Queue,
    resilience?: ResilienceLayer,
  ) {
    this.resilience = resilience ?? new PassthroughResilienceLayer();
  }

  /** Returns the number of raw-result jobs enqueued. */
  async execute(config: SearchConfig): Promise<number> {
    // Flexible destination: iterate over each expanded candidate substituted into the last waypoint
    if (config.destinationMode === 'flexible' && config.destinationCandidates?.length) {
      return this.executeFlexibleDestination(config);
    }

    // Window mode: slide a single-day departure window across the date range
    if (config.windowMode && config.windowDuration) {
      return this.executeWindowMode(config);
    }

    return this.executeWaypoints(config);
  }

  private async executeWaypoints(config: SearchConfig): Promise<number> {
    if (!config.waypoints || config.waypoints.length === 0) {
      console.warn(`Search ${config.id} has no waypoints; skipping`);
      return 0;
    }

    const sequences = enumerateLegSequences(config.origin, config.waypoints);
    const baseFrom = new Date(config.departureFrom);
    const baseTo = new Date(config.departureTo);

    // Compute per-pair date windows by walking each sequence and accumulating
    // the min/max days of preceding waypoint gaps. A pair that appears in
    // multiple sequences gets the union (earliest start, latest end).
    // Build per-arrival-airport passenger map from waypoints + returnPassengers.
    const paxByArrival: Record<string, number> = {};
    for (const wp of config.waypoints) {
      if (wp.passengers && wp.passengers > 0) {
        paxByArrival[wp.airport] = wp.passengers;
      }
    }
    const returnPax = (config as any).returnPassengers ?? config.passengers;

    const pairWindows = new Map<string, { origin: string; destination: string; from: Date; to: Date; passengers: number }>();
    for (const seq of sequences) {
      let cumMin = 0;
      let cumMax = 0;
      for (let i = 0; i < seq.legs.length; i++) {
        const leg = seq.legs[i];
        const key = `${leg.origin}→${leg.destination}`;
        const isReturn = leg.destination === config.origin;
        const legPax = isReturn ? returnPax : (paxByArrival[leg.destination] ?? config.passengers);
        const legFrom = new Date(baseFrom);
        legFrom.setUTCDate(legFrom.getUTCDate() + cumMin);
        const legTo = new Date(baseTo);
        legTo.setUTCDate(legTo.getUTCDate() + cumMax);
        const existing = pairWindows.get(key);
        if (existing) {
          if (legFrom < existing.from) existing.from = legFrom;
          if (legTo > existing.to) existing.to = legTo;
        } else {
          pairWindows.set(key, { origin: leg.origin, destination: leg.destination, from: legFrom, to: legTo, passengers: legPax });
        }
        // Accumulate the gap that follows this leg (i.e. the i-th gap), if any
        const gap = seq.gapConstraints[i];
        if (gap) {
          cumMin += gap.minDays;
          cumMax += gap.maxDays;
        }
      }
    }
    // If the user set a returnBy deadline, cap the return leg's date window.
    // The return leg is the LAST pair in each sequence: destination === origin.
    const returnBy = (config as any).returnBy ? new Date((config as any).returnBy) : null;
    if (returnBy) {
      for (const [key, pair] of pairWindows) {
        if (pair.destination === config.origin && pair.to > returnBy) {
          pair.to = returnBy;
          // Also cap from if it somehow exceeds returnBy
          if (pair.from > returnBy) pair.from = returnBy;
        }
      }
    }
    const uniquePairs = Array.from(pairWindows.values());
    console.log(`  Waypoint dispatcher: ${sequences.length} sequence(s), ${uniquePairs.length} unique pair(s): ${uniquePairs.map(p => `${p.origin}→${p.destination}`).join(', ')}`);

    const regions = config.proxyRegions.length > 0 ? config.proxyRegions : ['default'];
    let enqueued = 0;

    for (const region of regions) {
      const proxyUrl = await this.vpnRouter.getProxyUrl(region);
      for (const source of this.sources) {
        for (const pair of uniquePairs) {
          const leg: SearchLegInput & { passengers?: number } = {
            origin: pair.origin,
            destination: pair.destination,
            departureFrom: pair.from,
            departureTo: pair.to,
            passengers: pair.passengers,
          };
          console.log(
            `  Source ${source.name} waypoint pair (${pair.origin}→${pair.destination}, region: ${region})...`,
          );
          const { result, skipped } = await this.resilience.callSource(
            source.name,
            false,
            () => source.searchOneWay(config, leg, proxyUrl),
          );
          if (skipped) continue;
          const results: FlightResult[] = result ?? [];
          console.log(`  Source ${source.name} pair (${pair.origin}→${pair.destination}): ${results.length} result(s)`);
          for (const r of results) {
            await this.rawResultsQueue.add(QUEUE_NAMES.RAW_RESULTS, r, {
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 },
            });
            enqueued++;
          }
        }
      }
    }
    return enqueued;
  }

  private async executeFlexibleDestination(config: SearchConfig): Promise<number> {
    if (!config.waypoints || config.waypoints.length === 0) {
      console.warn(`Search ${config.id} (flexible) has no waypoints; skipping`);
      return 0;
    }

    const candidates = expandDestinationCandidates(config.destinationCandidates!);
    const lastWaypointIndex = config.waypoints.length - 1;
    let total = 0;

    for (const destination of candidates) {
      const newWaypoints = [...config.waypoints];
      if (newWaypoints[lastWaypointIndex]) {
        newWaypoints[lastWaypointIndex] = {
          ...newWaypoints[lastWaypointIndex],
          airport: destination,
        };
      }
      const syntheticConfig: SearchConfig = {
        ...config,
        waypoints: newWaypoints,
        destinationMode: 'single',
        destinationCandidates: undefined,
      };
      total += await this.executeWaypoints(syntheticConfig);
    }
    return total;
  }

  private async executeWindowMode(config: SearchConfig): Promise<number> {
    const rangeStart = new Date(config.departureFrom);
    const rangeEnd = new Date(config.departureTo);
    // Note: windowDuration and windowFlexibility are present on the type for
    // compatibility but the trip duration is derived from waypoint stays in the
    // waypoint model, so they are intentionally ignored by the dispatcher here.
    const MAX_WINDOWS = 30;
    let count = 0;
    let total = 0;
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd && count < MAX_WINDOWS) {
      const synth: SearchConfig = {
        ...config,
        departureFrom: new Date(cursor),
        departureTo: new Date(cursor),
        windowMode: false,
      };
      total += await this.executeWaypoints(synth);
      count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return total;
  }
}
