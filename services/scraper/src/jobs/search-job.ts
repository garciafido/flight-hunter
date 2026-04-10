import type { Queue } from 'bullmq';
import type { SearchConfig, FlightResult } from '@flight-hunter/shared';
import { QUEUE_NAMES, expandDestinationCandidates } from '@flight-hunter/shared';
import type { FlightSource } from '../sources/base-source.js';
import type { VpnRouter } from '../proxy/vpn-router.js';
import type { GoogleFlightsSource } from '../sources/google-flights.js';
import type { ResilienceLayer } from '../resilience/resilience-layer.js';
import { PassthroughResilienceLayer } from '../resilience/resilience-layer.js';

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
    // Flexible destination: iterate over each expanded candidate
    if (config.destinationMode === 'flexible' && config.destinationCandidates?.length) {
      return this.executeFlexibleDestination(config);
    }

    // Window mode: iterate over vacation windows
    if (config.windowMode && config.windowDuration) {
      return this.executeWindowMode(config);
    }

    const mode = config.mode ?? 'roundtrip';

    if (mode === 'split' && config.legs && config.legs.length > 0) {
      await this.executeSplit(config);
    } else {
      await this.executeRoundtrip(config);
    }
  }

  private async executeFlexibleDestination(config: SearchConfig): Promise<void> {
    const destinations = expandDestinationCandidates(config.destinationCandidates!);
    for (const destination of destinations) {
      const syntheticConfig: SearchConfig = {
        ...config,
        destination,
        destinationMode: 'single',
        destinationCandidates: undefined,
      };
      const mode = config.mode ?? 'roundtrip';
      if (mode === 'split' && config.legs && config.legs.length > 0) {
        await this.executeSplit(syntheticConfig);
      } else {
        await this.executeRoundtrip(syntheticConfig);
      }
    }
  }

  private async executeWindowMode(config: SearchConfig): Promise<void> {
    const duration = config.windowDuration!;
    const flexibility = config.windowFlexibility ?? 0;
    const rangeStart = new Date(config.departureFrom);
    const rangeEnd = new Date(config.departureTo);

    const MAX_WINDOWS = 30;
    let windowCount = 0;

    const current = new Date(rangeStart);
    while (current <= rangeEnd && windowCount < MAX_WINDOWS) {
      const windowStart = new Date(current);
      const windowEnd = new Date(current);
      windowEnd.setDate(windowEnd.getDate() + duration);

      const syntheticConfig: SearchConfig = {
        ...config,
        departureFrom: windowStart,
        departureTo: windowStart,
        returnMinDays: Math.max(1, duration - flexibility),
        returnMaxDays: duration + flexibility,
        windowMode: false,
      };

      await this.executeRoundtrip(syntheticConfig);
      windowCount++;

      current.setDate(current.getDate() + 1);
    }
  }

  private async executeRoundtrip(config: SearchConfig): Promise<void> {
    const regions = config.proxyRegions.length > 0 ? config.proxyRegions : ['default'];

    for (const region of regions) {
      const proxyUrl = await this.vpnRouter.getProxyUrl(region);

      for (const source of this.sources) {
        console.log(`  Source ${source.name} (region: ${region})...`);
        const { result, skipped } = await this.resilience.callSource(
          source.name,
          false,
          () => source.search(config, proxyUrl),
        );

        if (skipped) {
          // circuit open — already logged inside resilience layer
          continue;
        }

        const results: FlightResult[] = result ?? [];
        console.log(`  Source ${source.name}: ${results.length} result(s)`);
        for (const r of results) {
          await this.rawResultsQueue.add(QUEUE_NAMES.RAW_RESULTS, r, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          });
        }
      }
    }
  }

  private async executeSplit(config: SearchConfig): Promise<void> {
    const regions = config.proxyRegions.length > 0 ? config.proxyRegions : ['default'];
    const legs = config.legs!;

    // Find sources that support one-way searching (GoogleFlightsSource)
    const oneWaySources = this.sources.filter(
      (s): s is GoogleFlightsSource =>
        typeof (s as any).searchOneWay === 'function',
    );

    for (const region of regions) {
      const proxyUrl = await this.vpnRouter.getProxyUrl(region);

      for (const source of oneWaySources) {
        for (let legIndex = 0; legIndex < legs.length; legIndex++) {
          const leg = legs[legIndex];
          console.log(`  Source ${source.name} leg ${legIndex} (${leg.origin}→${leg.destination}, region: ${region})...`);

          const { result, skipped } = await this.resilience.callSource(
            source.name,
            false,
            () => source.searchOneWay(config, legIndex, leg, proxyUrl),
          );

          if (skipped) {
            continue;
          }

          const results: FlightResult[] = result ?? [];
          console.log(`  Source ${source.name} leg ${legIndex}: ${results.length} result(s)`);
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
}
