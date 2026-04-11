import type { Queue } from 'bullmq';
import type { SearchConfig, FlightResult } from '@flight-hunter/shared';
import { QUEUE_NAMES, expandDestinationCandidates, enumerateLegSequences } from '@flight-hunter/shared';
import type { FlightSource } from '../sources/base-source.js';
import type { VpnRouter } from '../proxy/vpn-router.js';
import type { GoogleFlightsSource } from '../sources/google-flights.js';
import type { ResilienceLayer } from '../resilience/resilience-layer.js';
import { PassthroughResilienceLayer } from '../resilience/resilience-layer.js';

type SearchLegInput = { origin: string; destination: string; departureFrom: Date; departureTo: Date };

export class SearchJobProcessor {
  private readonly resilience: ResilienceLayer;

  constructor(
    private readonly sources: FlightSource[],
    private readonly vpnRouter: VpnRouter,
    private readonly rawResultsQueue: Queue,
    resilience?: ResilienceLayer,
  ) {
    this.resilience = resilience ?? new PassthroughResilienceLayer();
  }

  async execute(config: SearchConfig): Promise<void> {
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

  private async executeWaypoints(config: SearchConfig): Promise<void> {
    if (!config.waypoints || config.waypoints.length === 0) {
      console.warn(`Search ${config.id} has no waypoints; skipping`);
      return;
    }

    const sequences = enumerateLegSequences(config.origin, config.waypoints);

    // Collect unique (origin, destination) pairs across all sequences
    const seen = new Set<string>();
    const uniquePairs: Array<{ origin: string; destination: string }> = [];
    for (const seq of sequences) {
      for (const leg of seq.legs) {
        const key = `${leg.origin}→${leg.destination}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniquePairs.push(leg);
        }
      }
    }

    const regions = config.proxyRegions.length > 0 ? config.proxyRegions : ['default'];
    const oneWaySources = this.sources.filter(
      (s): s is GoogleFlightsSource =>
        typeof (s as any).searchOneWay === 'function',
    );

    for (const region of regions) {
      const proxyUrl = await this.vpnRouter.getProxyUrl(region);
      for (const source of oneWaySources) {
        for (const pair of uniquePairs) {
          const leg: SearchLegInput = {
            origin: pair.origin,
            destination: pair.destination,
            departureFrom: new Date(config.departureFrom),
            departureTo: new Date(config.departureTo),
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
          }
        }
      }
    }
  }

  private async executeFlexibleDestination(config: SearchConfig): Promise<void> {
    if (!config.waypoints || config.waypoints.length === 0) {
      console.warn(`Search ${config.id} (flexible) has no waypoints; skipping`);
      return;
    }

    const candidates = expandDestinationCandidates(config.destinationCandidates!);
    const lastWaypointIndex = config.waypoints.length - 1;

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
      await this.executeWaypoints(syntheticConfig);
    }
  }

  private async executeWindowMode(config: SearchConfig): Promise<void> {
    const rangeStart = new Date(config.departureFrom);
    const rangeEnd = new Date(config.departureTo);
    // Note: windowDuration and windowFlexibility are present on the type for
    // compatibility but the trip duration is derived from waypoint stays in the
    // waypoint model, so they are intentionally ignored by the dispatcher here.
    const MAX_WINDOWS = 30;
    let count = 0;
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd && count < MAX_WINDOWS) {
      const synth: SearchConfig = {
        ...config,
        departureFrom: new Date(cursor),
        departureTo: new Date(cursor),
        windowMode: false,
      };
      await this.executeWaypoints(synth);
      count++;
      cursor.setDate(cursor.getDate() + 1);
    }
  }
}
