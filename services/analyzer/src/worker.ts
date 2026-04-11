import type { PrismaClient } from '@flight-hunter/shared/db';
import type { RawResultJob, SearchConfig, FlightResult } from '@flight-hunter/shared';
import { normalizePricePerPerson } from '@flight-hunter/shared';
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

    const stopoverScore = computeStopoverScore(data.stopover, searchConfig.stopover);

    const airlineScore = computeAirlineScore(data.outbound.airline, data.inbound.airline, filters);

    const flexibilityScore = computeFlexibilityScore(data.outbound.airline, data.inbound.airline);

    const scoreResult = this.scoringEngine.compute([
      { name: 'price', score: priceScore },
      { name: 'schedule', score: scheduleScore },
      { name: 'stopover', score: stopoverScore },
      { name: 'airline', score: airlineScore },
      { name: 'flexibility', score: flexibilityScore },
    ]);

    // Detect deal at the leg/result level.
    // For SPLIT mode, individual legs MUST NOT trigger alerts because
    // the user's price thresholds (max/target/dream) refer to the TOTAL
    // trip cost. Only complete combos can trigger alerts in split mode.
    const isSplitMode = (search as any).mode === 'split';
    const alertLevel = isSplitMode
      ? null
      : this.deps.dealDetector.detect(
          scoreResult.total,
          pricePerPerson,
          alertConfig,
          history ?? undefined,
        );

    // Outlier detection
    const outlier = await this.deps.outlierDetector.check(
      data.searchId,
      pricePerPerson,
      data.source,
      history?.avg48h ?? null,
    );

    // Publish
    await this.deps.publisher.publish({
      flight,
      pricePerPerson,
      score: scoreResult.total,
      scoreBreakdown: scoreResult.breakdown,
      alertLevel,
      suspicious: outlier.suspicious,
      suspicionReason: outlier.suspicionReason,
    });

    // For split-mode searches, evaluate combos after saving each leg result
    const searchMode = (search as any).mode ?? 'roundtrip';
    const searchLegs = (search as any).legs;
    if (searchMode === 'split' && Array.isArray(searchLegs) && searchLegs.length > 0) {
      try {
        await this.evaluateCombos(data.searchId, searchLegs.length, searchConfig, search as any);
      } catch (err) {
        console.error('evaluateCombos failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  private async evaluateCombos(
    searchId: string,
    legCount: number,
    searchConfig: SearchConfig,
    searchRecord: any,
  ): Promise<void> {
    const maxCombos: number = (searchRecord as any).maxCombos ?? 100;
    const TOP_N = topNPerLeg(maxCombos, legCount);

    // Fetch top N cheapest results per leg
    const legResultArrays: FlightResult[][] = [];
    for (let i = 0; i < legCount; i++) {
      const rows = await this.deps.prisma.flightResult.findMany({
        where: { searchId, legIndex: i },
        orderBy: { pricePerPerson: 'asc' },
        take: TOP_N,
      });

      const results: (FlightResult & { id: string })[] = rows.map((row: any) => ({
        id: row.id,
        searchId: row.searchId,
        source: row.source as FlightResult['source'],
        outbound: row.outbound as FlightResult['outbound'],
        inbound: row.inbound as FlightResult['inbound'],
        stopover: row.stopoverInfo as FlightResult['stopover'] | undefined,
        totalPrice: Number(row.pricePerPerson),
        currency: row.currency,
        pricePer: 'person' as const,
        passengers: 1,
        carryOnIncluded: row.carryOnIncluded,
        bookingUrl: row.bookingUrl,
        scrapedAt: row.scrapedAt,
        proxyRegion: row.proxyRegion as FlightResult['proxyRegion'],
        legIndex: row.legIndex,
      }));

      legResultArrays.push(results);
    }

    // Need results for all legs to build combos
    if (legResultArrays.some((arr) => arr.length === 0)) return;

    const combos = buildCombos(legResultArrays, TOP_N);
    if (combos.length === 0) return;

    // Score each combo and pick the best one
    const scoredCombos = combos.map((combo) => ({
      combo,
      ...scoreCombo(combo, searchConfig),
    }));

    scoredCombos.sort((a, b) => b.score - a.score);
    const best = scoredCombos[0];

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

    // Save the best combo to the FlightCombo table
    let savedComboId: string | undefined;
    try {
      const created = await (this.deps.prisma as any).flightCombo.create({
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
      savedComboId = created?.id as string | undefined;
    } catch (err) {
      // Non-fatal — combo saving should not break the main flow
      console.error('Failed to save FlightCombo:', err instanceof Error ? err.message : err);
    }

    // Publish the combo as an alert if it qualifies (split-mode only path).
    // The total price here represents the FULL trip cost per person,
    // which is what the user's thresholds actually refer to.
    // The Alert.flightResultId FK points at flight_results (not flight_combos),
    // so we use the first leg's id for that field; the AlertJob.combo payload
    // carries the full leg list for display.
    const firstLegId = (best.combo[0] as any).id as string | undefined;
    if (alertLevel && firstLegId) {
      try {
        await this.deps.publisher.publishComboAlert({
          searchId,
          flightResultId: firstLegId,
          legs: best.combo,
          totalPricePerPerson: totalPrice,
          score: best.score,
          scoreBreakdown: best.breakdown,
          alertLevel,
        });
      } catch (err) {
        console.error('Failed to publish combo alert:', err instanceof Error ? err.message : err);
      }
    }
  }
}
