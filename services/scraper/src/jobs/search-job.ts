import type { Queue } from 'bullmq';
import type { SearchConfig, FlightResult } from '@flight-hunter/shared';
import { QUEUE_NAMES } from '@flight-hunter/shared';
import type { FlightSource } from '../sources/base-source.js';
import type { VpnRouter } from '../proxy/vpn-router.js';
import type { GoogleFlightsSource } from '../sources/google-flights.js';

export class SearchJobProcessor {
  constructor(
    private readonly sources: FlightSource[],
    private readonly vpnRouter: VpnRouter,
    private readonly rawResultsQueue: Queue,
  ) {}

  async execute(config: SearchConfig): Promise<void> {
    const mode = config.mode ?? 'roundtrip';

    if (mode === 'split' && config.legs && config.legs.length > 0) {
      await this.executeSplit(config);
    } else {
      await this.executeRoundtrip(config);
    }
  }

  private async executeRoundtrip(config: SearchConfig): Promise<void> {
    const regions = config.proxyRegions.length > 0 ? config.proxyRegions : ['default'];

    for (const region of regions) {
      const proxyUrl = await this.vpnRouter.getProxyUrl(region);

      for (const source of this.sources) {
        try {
          console.log(`  Source ${source.name} (region: ${region})...`);
          const results = await source.search(config, proxyUrl);
          console.log(`  Source ${source.name}: ${results.length} result(s)`);
          for (const result of results) {
            await this.rawResultsQueue.add(QUEUE_NAMES.RAW_RESULTS, result);
          }
        } catch (err) {
          console.error(`  Source ${source.name} failed:`, err instanceof Error ? err.message : err);
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
          try {
            console.log(`  Source ${source.name} leg ${legIndex} (${leg.origin}→${leg.destination}, region: ${region})...`);
            const results = await source.searchOneWay(config, legIndex, leg, proxyUrl);
            console.log(`  Source ${source.name} leg ${legIndex}: ${results.length} result(s)`);
            for (const result of results) {
              await this.rawResultsQueue.add(QUEUE_NAMES.RAW_RESULTS, result);
            }
          } catch (err) {
            console.error(`  Source ${source.name} leg ${legIndex} failed:`, err instanceof Error ? err.message : err);
          }
        }
      }
    }
  }
}
