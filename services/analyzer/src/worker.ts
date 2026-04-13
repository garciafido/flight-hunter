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

export interface AnalyzerDeps {
  prisma: PrismaClient;
  historyService: HistoryService;
  filterEngine: FilterEngine;
  dealDetector: DealDetector;
  outlierDetector: OutlierDetector;
  publisher: Publisher;
}

/**
 * Processes individual flight results: persist, filter, score.
 * Does NOT evaluate combos — that's handled by ComboEvaluator via
 * the evaluate-combos queue after the scraper finishes a full tick.
 */
export class AnalyzerWorker {
  private readonly scoringEngine: ScoringEngine;

  constructor(private readonly deps: AnalyzerDeps) {
    this.scoringEngine = new ScoringEngine(resolveWeights());
  }

  async process(data: RawResultJob): Promise<void> {
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
    const filterResult = this.deps.filterEngine.apply(flight, filters, {
      maxConnectionHours: searchConfig.maxConnectionHours,
    });
    if (!filterResult.passed) {
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

    const history = await this.deps.historyService.getPriceHistory(data.searchId);

    const priceScore = computePriceScore(
      pricePerPerson,
      {
        maxPricePerPerson: alertConfig.maxPrice ?? alertConfig.maxPricePerPerson ?? 2000,
        targetPricePerPerson: alertConfig.targetPrice ?? alertConfig.targetPricePerPerson,
        dreamPricePerPerson: alertConfig.dreamPrice ?? alertConfig.dreamPricePerPerson,
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

    // Single-flight alerts suppressed — combo alerts via evaluate-combos queue.
    const alertLevel = null;

    const outlier = await this.deps.outlierDetector.check(
      data.searchId,
      pricePerPerson,
      data.source,
      history?.avg48h ?? null,
    );

    await this.deps.publisher.publish({
      flight,
      pricePerPerson,
      score: scoreResult.total,
      scoreBreakdown: scoreResult.breakdown,
      alertLevel,
      suspicious: outlier.suspicious,
      suspicionReason: outlier.suspicionReason,
    });
  }
}
