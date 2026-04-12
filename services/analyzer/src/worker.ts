import type { PrismaClient } from '@flight-hunter/shared/db';
import type { RawResultJob, SearchConfig, FlightResult } from '@flight-hunter/shared';
import { normalizePricePerPerson, enumerateLegSequences, type Waypoint, type LegSequence } from '@flight-hunter/shared';
import { ScoringEngine } from './scoring/engine.js';
import { computePriceScore } from './scoring/price-score.js';
import { computeScheduleScore } from './scoring/schedule-score.js';
import { computeStopoverScore } from './scoring/stopover-score.js';
import { computeAirlineScore } from './scoring/airline-score.js';
import { computeFlexibilityScore } from './scoring/flexibility-score.js';
import { FilterEngine } from './filters/filter-engine.js';
import { DealDetector } from './detection/deal-detector.js';
import { HistoryService } from './detection/history.js';
import { OutlierDetector } from './detection/outlier-detector.js';
import { Publisher } from './publisher.js';
import { resolveWeights } from './scoring/weights.js';
import { buildCombos, scoreCombo, topNPerLeg } from './combos/combo-builder.js';

export interface AnalyzerDeps {
  prisma: PrismaClient;
  historyService: HistoryService;
  filterEngine: FilterEngine;
  dealDetector: DealDetector;
  outlierDetector: OutlierDetector;
  publisher: Publisher;
}

export class AnalyzerWorker {
  private readonly scoringEngine: ScoringEngine;

  constructor(private readonly deps: AnalyzerDeps) {
    this.scoringEngine = new ScoringEngine(resolveWeights());
  }

  async process(data: RawResultJob): Promise<void> {
    // Find the search config
    const search = await this.deps.prisma.search.findUnique({
      where: { id: data.searchId },
    });

    if (!search) {
      throw new Error(`Search not found: ${data.searchId}`);
    }

    const searchConfig = search as unknown as SearchConfig;
    const filters = searchConfig.filters;
    const alertConfig = searchConfig.alertConfig;

    const flight: FlightResult = {
      ...data,
      scrapedAt: new Date(data.scrapedAt),
      exchangeRateAt: data.exchangeRateAt ? new Date(data.exchangeRateAt) : undefined,
    };

    // Filter
    const filterResult = this.deps.filterEngine.apply(flight, filters);
    if (!filterResult.passed) {
      // Filtered out - still save but with no alert
      const pricePerPerson = normalizePricePerPerson(
        data.totalPrice,
        data.pricePer,
        data.passengers,
      );
      await this.deps.publisher.publish({
        flight,
        pricePerPerson,
        score: 0,
        scoreBreakdown: { price: 0, schedule: 0, stopover: 0, airline: 0, flexibility: 0 },
        alertLevel: null,
      });
      return;
    }

    const pricePerPerson = normalizePricePerPerson(data.totalPrice, data.pricePer, data.passengers);

    // Get history
    const history = await this.deps.historyService.getPriceHistory(data.searchId);

    // Score all components
    const priceScore = computePriceScore(
      pricePerPerson,
      {
        maxPricePerPerson: alertConfig.maxPricePerPerson,
        targetPricePerPerson: alertConfig.targetPricePerPerson,
        dreamPricePerPerson: alertConfig.dreamPricePerPerson,
      },
      history ?? undefined,
    );

    const scheduleScore = computeScheduleScore(data.outbound, data.inbound);

    const stopoverScore = computeStopoverScore(data.stopover);

    const airlineScore = computeAirlineScore(data.outbound.airline, data.inbound.airline, filters);

    const flexibilityScore = computeFlexibilityScore(data.outbound.airline, data.inbound.airline);

    const scoreResult = this.scoringEngine.compute([
      { name: 'price', score: priceScore },
      { name: 'schedule', score: scheduleScore },
      { name: 'stopover', score: stopoverScore },
      { name: 'airline', score: airlineScore },
      { name: 'flexibility', score: flexibilityScore },
    ]);

    // Single-flight alerts are suppressed — every search is multi-leg (waypoints).
    // The combo alert fires only after evaluateWaypointSequences, which uses the
    // total trip price against the user's thresholds.
    const alertLevel = null;

    // Outlier detection
    const outlier = await this.deps.outlierDetector.check(
      data.searchId,
      pricePerPerson,
      data.source,
      history?.avg48h ?? null,
    );

    // Publish (persist to DB; no single-flight alert)
    await this.deps.publisher.publish({
      flight,
      pricePerPerson,
      score: scoreResult.total,
      scoreBreakdown: scoreResult.breakdown,
      alertLevel,
      suspicious: outlier.suspicious,
      suspicionReason: outlier.suspicionReason,
    });

    // Evaluate combos for waypoint-based searches
    const waypoints = (search as any).waypoints as Waypoint[] | undefined;
    if (Array.isArray(waypoints) && waypoints.length > 0) {
      try {
        await this.evaluateWaypointSequences(data.searchId, searchConfig, search as any);
      } catch (err) {
        console.error('evaluateWaypointSequences failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  private async evaluateWaypointSequences(
    searchId: string,
    searchConfig: SearchConfig,
    searchRecord: any,
  ): Promise<void> {
    const waypoints = searchRecord.waypoints as Waypoint[];
    const origin = searchConfig.origin;
    const sequences = enumerateLegSequences(origin, waypoints);
    const maxCombos: number = searchRecord.maxCombos ?? 100;
    const TOP_N = topNPerLeg(maxCombos, waypoints.length + 1);

    for (const sequence of sequences) {
      try {
        await this.evaluateOneSequence(searchId, searchConfig, searchRecord, sequence, waypoints, TOP_N);
      } catch (err) {
        console.error('evaluateOneSequence failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  private async evaluateOneSequence(
    searchId: string,
    searchConfig: SearchConfig,
    searchRecord: any,
    sequence: LegSequence,
    waypoints: Waypoint[],
    topN: number,
  ): Promise<void> {
    // Fetch flights for each leg pair — filter in memory by airport pair.
    // Fetching all flights per search and filtering is fine for personal-use scale.
    const legResultArrays: (FlightResult & { id: string })[][] = [];
    for (const legPair of sequence.legs) {
      const rows = await this.deps.prisma.flightResult.findMany({
        where: { searchId },
        orderBy: { pricePerPerson: 'asc' },
      });
      const matching = rows
        .filter((r: any) => {
          const dep = r.outbound?.departure?.airport;
          const arr = r.outbound?.arrival?.airport;
          return dep === legPair.origin && arr === legPair.destination;
        })
        .slice(0, topN)
        .map((row: any) => ({
          id: row.id,
          searchId: row.searchId,
          source: row.source,
          outbound: row.outbound,
          inbound: row.inbound,
          stopover: row.stopoverInfo ?? undefined,
          totalPrice: Number(row.pricePerPerson),
          currency: row.currency,
          pricePer: 'person' as const,
          passengers: 1,
          carryOnIncluded: row.carryOnIncluded,
          bookingUrl: row.bookingUrl,
          scrapedAt: row.scrapedAt,
          proxyRegion: row.proxyRegion,
        }));
      legResultArrays.push(matching);
    }

    // All legs must have at least one result to form a combo
    if (legResultArrays.some((arr) => arr.length === 0)) return;

    const combos = buildCombos(legResultArrays, {
      topN,
      gapConstraints: sequence.gapConstraints,
    });
    if (combos.length === 0) return;

    const scoredCombos = combos.map((combo) => ({
      combo,
      ...scoreCombo(combo, searchConfig),
    }));
    scoredCombos.sort((a, b) => b.score - a.score);
    const best = scoredCombos[0];

    // Build waypoint payload reflecting the actual flown order.
    // sequence.legs has length waypoints.length + 1; the destination of leg i (i < length-1)
    // is the i-th waypoint in the flown order.
    const waypointPayload = sequence.legs.slice(0, -1).map((leg) => {
      const wp = waypoints.find((w) => w.airport === leg.destination);
      if (!wp) throw new Error(`No waypoint config for ${leg.destination}`);
      if (wp.gap.type === 'stay') {
        return {
          airport: wp.airport,
          type: 'stay' as const,
          minDays: wp.gap.minDays,
          maxDays: wp.gap.maxDays,
        };
      }
      return {
        airport: wp.airport,
        type: 'connection' as const,
        maxHours: wp.gap.maxHours,
      };
    });

    const totalPrice = best.combo.reduce((sum, r) => sum + r.totalPrice, 0);
    const currency = best.combo[0].currency;
    const flightResultIds = best.combo.map((r: any) => r.id).filter(Boolean);

    const alertConfig = searchConfig.alertConfig;
    const alertLevel = this.deps.dealDetector.detect(
      best.score,
      totalPrice,
      alertConfig,
      undefined,
    );

    try {
      await (this.deps.prisma as any).flightCombo.create({
        data: {
          searchId,
          flightResultIds,
          totalPrice,
          currency,
          score: best.score,
          scoreBreakdown: best.breakdown as object,
          alertLevel: alertLevel ?? undefined,
        },
      });
    } catch (err) {
      console.error('Failed to save FlightCombo:', err instanceof Error ? err.message : err);
    }

    const firstLegId = (best.combo[0] as any).id as string | undefined;
    if (alertLevel && firstLegId) {
      try {
        // Build per-arrival-airport maps from the waypoint config.
        const checkedBagsByArrival: Record<string, number> = {};
        const passengersByArrival: Record<string, number> = {};
        for (const wp of waypoints) {
          if (wp.checkedBags && wp.checkedBags > 0) {
            checkedBagsByArrival[wp.airport] = wp.checkedBags;
          }
          if (wp.passengers && wp.passengers > 0) {
            passengersByArrival[wp.airport] = wp.passengers;
          }
        }

        await this.deps.publisher.publishComboAlert({
          searchId,
          flightResultId: firstLegId,
          legs: best.combo,
          totalPricePerPerson: totalPrice,
          score: best.score,
          scoreBreakdown: best.breakdown,
          alertLevel,
          waypoints: waypointPayload,
          requireCarryOn: searchConfig.filters.requireCarryOn,
          checkedBagsByArrival,
          returnCheckedBags: (searchRecord as any).returnCheckedBags ?? 0,
          globalPassengers: searchConfig.passengers,
          passengersByArrival,
          returnPassengers: (searchRecord as any).returnPassengers ?? undefined,
        });
      } catch (err) {
        console.error('Failed to publish combo alert:', err instanceof Error ? err.message : err);
      }
    }
  }
}
