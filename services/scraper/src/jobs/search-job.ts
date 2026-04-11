import type { Queue } from 'bullmq';
import type { SearchConfig, FlightResult, SearchLeg, StopoverPlan, StopoverPlanPosition } from '@flight-hunter/shared';
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

    if (mode === 'split' && config.stopoverPlan) {
      await this.executeStopoverPlan(config);
    } else if (mode === 'split' && config.legs && config.legs.length > 0) {
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
      if (mode === 'split' && syntheticConfig.stopoverPlan) {
        await this.executeStopoverPlan(syntheticConfig);
      } else if (mode === 'split' && config.legs && config.legs.length > 0) {
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

  /**
   * Build 3 legs from a StopoverPlan for a specific position ('start' or 'end').
   * The 5-day floor ensures a minimum vacation time at the destination.
   */
  buildLegsFromPlan(
    config: SearchConfig,
    plan: StopoverPlan,
    position: Exclude<StopoverPlanPosition, 'any'>,
  ): SearchLeg[] {
    const MIN_VACATION_DAYS = 5;
    const depFrom = new Date(config.departureFrom);
    const depTo = new Date(config.departureTo);
    const returnMaxDays = config.returnMaxDays;

    function addDays(base: Date, days: number): Date {
      const d = new Date(base);
      d.setDate(d.getDate() + days);
      return d;
    }

    if (position === 'end') {
      // leg 0: origin → destination, departs in config departure range
      const leg0From = depFrom;
      const leg0To = depTo;

      // leg 1: destination → stopover, departs after leg0 + MIN_VACATION_DAYS
      // latest departure: leg0From + (returnMaxDays - plan.maxDays - 1)
      const leg1From = addDays(leg0From, MIN_VACATION_DAYS);
      const leg1To = addDays(leg0From, Math.max(MIN_VACATION_DAYS, returnMaxDays - plan.maxDays - 1));

      // leg 2: stopover → origin, departs leg1 + plan.minDays..plan.maxDays
      const leg2From = addDays(leg1From, plan.minDays);
      const leg2To = addDays(leg1To, plan.maxDays);

      return [
        { origin: config.origin, destination: config.destination, departureFrom: leg0From, departureTo: leg0To },
        { origin: config.destination, destination: plan.airport, departureFrom: leg1From, departureTo: leg1To },
        { origin: plan.airport, destination: config.origin, departureFrom: leg2From, departureTo: leg2To },
      ];
    } else {
      // position === 'start'
      // leg 0: origin → stopover, departs in config departure range
      const leg0From = depFrom;
      const leg0To = depTo;

      // leg 1: stopover → destination, departs leg0 + plan.minDays..plan.maxDays
      const leg1From = addDays(leg0From, plan.minDays);
      const leg1To = addDays(leg0To, plan.maxDays);

      // leg 2: destination → origin, departs leg1 + MIN_VACATION_DAYS..
      // latest: leg1From + (returnMaxDays - plan.maxDays - 1)
      const leg2From = addDays(leg1From, MIN_VACATION_DAYS);
      const leg2To = addDays(leg1From, Math.max(MIN_VACATION_DAYS, returnMaxDays - plan.maxDays - 1));

      return [
        { origin: config.origin, destination: plan.airport, departureFrom: leg0From, departureTo: leg0To },
        { origin: plan.airport, destination: config.destination, departureFrom: leg1From, departureTo: leg1To },
        { origin: config.destination, destination: config.origin, departureFrom: leg2From, departureTo: leg2To },
      ];
    }
  }

  private async executeStopoverPlan(config: SearchConfig): Promise<void> {
    const plan = config.stopoverPlan!;
    const planSpecs: Array<{ position: Exclude<StopoverPlanPosition, 'any'>; planIndex: number }> =
      plan.position === 'any'
        ? [
            { position: 'start', planIndex: 0 },
            { position: 'end', planIndex: 1 },
          ]
        : [{ position: plan.position as Exclude<StopoverPlanPosition, 'any'>, planIndex: 0 }];

    // When the stopover is OPTIONAL, also search a plain roundtrip as fallback.
    // Direct results are tagged with planIndex 99 so the analyzer can route
    // them through the single-flight alert path while the combo builder skips them.
    if (plan.required === false) {
      const directLeg: SearchLeg = {
        origin: config.origin,
        destination: config.destination,
        departureFrom: new Date(config.departureFrom),
        departureTo: new Date(config.departureTo),
      };
      const regionsForDirect = config.proxyRegions.length > 0 ? config.proxyRegions : ['default'];
      const sourcesForDirect = this.sources.filter(
        (s): s is GoogleFlightsSource => typeof (s as any).searchOneWay === 'function',
      );
      for (const region of regionsForDirect) {
        const proxyUrl = await this.vpnRouter.getProxyUrl(region);
        for (const source of sourcesForDirect) {
          console.log(
            `  Source ${source.name} stopoverPlan[direct-fallback] (${directLeg.origin}→${directLeg.destination}, region: ${region})...`,
          );
          const { result, skipped } = await this.resilience.callSource(
            source.name,
            false,
            () => source.searchOneWay(config, 0, directLeg, proxyUrl),
          );
          if (skipped) continue;
          const directResults: FlightResult[] = result ?? [];
          console.log(
            `  Source ${source.name} stopoverPlan[direct-fallback]: ${directResults.length} result(s)`,
          );
          for (const r of directResults) {
            const tagged = { ...r, planIndex: 99 };
            await this.rawResultsQueue.add(QUEUE_NAMES.RAW_RESULTS, tagged, {
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 },
            });
          }
        }
      }
    }

    const regions = config.proxyRegions.length > 0 ? config.proxyRegions : ['default'];

    const oneWaySources = this.sources.filter(
      (s): s is GoogleFlightsSource =>
        typeof (s as any).searchOneWay === 'function',
    );

    for (const { position, planIndex } of planSpecs) {
      const legs = this.buildLegsFromPlan(config, plan, position);

      for (const region of regions) {
        const proxyUrl = await this.vpnRouter.getProxyUrl(region);

        for (const source of oneWaySources) {
          for (let legIndex = 0; legIndex < legs.length; legIndex++) {
            const leg = legs[legIndex];
            console.log(
              `  Source ${source.name} stopoverPlan[${position}] leg ${legIndex} (${leg.origin}→${leg.destination}, region: ${region})...`,
            );

            const { result, skipped } = await this.resilience.callSource(
              source.name,
              false,
              () => source.searchOneWay(config, legIndex, leg, proxyUrl),
            );

            if (skipped) {
              continue;
            }

            const results: FlightResult[] = result ?? [];
            console.log(
              `  Source ${source.name} stopoverPlan[${position}] leg ${legIndex}: ${results.length} result(s)`,
            );
            for (const r of results) {
              const tagged = { ...r, planIndex };
              await this.rawResultsQueue.add(QUEUE_NAMES.RAW_RESULTS, tagged, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
              });
            }
          }
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
