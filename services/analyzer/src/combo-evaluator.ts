import type { PrismaClient } from '@flight-hunter/shared/db';
import type { SearchConfig, FlightResult } from '@flight-hunter/shared';
import { enumerateLegSequences, getRuntimeConfig, type Waypoint, type LegSequence } from '@flight-hunter/shared';
import { DealDetector } from './detection/deal-detector.js';
import { Publisher } from './publisher.js';
import { buildCombos, scoreCombo, topNPerLeg } from './combos/combo-builder.js';

export interface ComboEvaluatorDeps {
  prisma: PrismaClient;
  dealDetector: DealDetector;
  publisher: Publisher;
}

/**
 * Evaluates multi-leg combos for a search ONCE, using all available
 * flight results. Triggered by the scraper after a full tick completes,
 * not on every individual flight result.
 */
export class ComboEvaluator {
  constructor(private readonly deps: ComboEvaluatorDeps) {}

  async evaluate(searchId: string): Promise<void> {
    const search = await this.deps.prisma.search.findUnique({
      where: { id: searchId },
    });
    if (!search) {
      console.warn(`ComboEvaluator: search not found: ${searchId}`);
      return;
    }

    const searchConfig = search as unknown as SearchConfig;
    const waypoints = (search as any).waypoints as Waypoint[] | undefined;
    if (!Array.isArray(waypoints) || waypoints.length === 0) return;

    const origin = searchConfig.origin;
    const sequences = enumerateLegSequences(origin, waypoints);
    const maxCombos: number = (search as any).maxCombos ?? 100;
    const TOP_N = topNPerLeg(maxCombos, waypoints.length + 1);

    // Fetch ALL recent results for this search ONCE.
    const maxAgeMs = getRuntimeConfig().resultMaxAgeHours * 60 * 60 * 1000;
    const recentCutoff = new Date(Date.now() - maxAgeMs);
    const allRows = await this.deps.prisma.flightResult.findMany({
      where: {
        searchId,
        scrapedAt: { gte: recentCutoff },
      },
      orderBy: { pricePerPerson: 'asc' },
    });

    console.log(`ComboEvaluator: ${allRows.length} recent results for search ${searchId}, ${sequences.length} sequence(s)`);

    if (allRows.length === 0) {
      console.warn(`ComboEvaluator: 0 results for search ${searchId} with ${waypoints.length} waypoint(s) — skipping combo evaluation`);
      return;
    }

    for (const sequence of sequences) {
      try {
        await this.evaluateOneSequence(searchId, searchConfig, search, sequence, waypoints, TOP_N, allRows);
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
    allRows: any[],
  ): Promise<void> {
    const legResultArrays: (FlightResult & { id: string })[][] = [];
    for (const legPair of sequence.legs) {
      const matching = allRows
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

    const totalPricePerPerson = best.combo.reduce((sum, r) => sum + r.totalPrice, 0);
    const currency = best.combo[0].currency;
    const flightResultIds = best.combo.map((r: any) => r.id).filter(Boolean);

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

    const lastIdx = best.combo.length - 1;
    const returnPax = (searchRecord as any).returnPassengers ?? searchConfig.passengers;
    const groupTicketTotal = best.combo.reduce((sum, l, i) => {
      const arrAirport = l.outbound.arrival.airport;
      const legPax = i === lastIdx
        ? returnPax
        : (passengersByArrival[arrAirport] ?? searchConfig.passengers);
      return sum + l.totalPrice * legPax;
    }, 0);

    const alertConfig = searchConfig.alertConfig;
    const alertLevel = this.deps.dealDetector.detect(
      best.score,
      groupTicketTotal,
      alertConfig,
      undefined,
    );

    try {
      await (this.deps.prisma as any).flightCombo.create({
        data: {
          searchId,
          flightResultIds,
          totalPrice: totalPricePerPerson,
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
        await this.deps.publisher.publishComboAlert({
          searchId,
          flightResultId: firstLegId,
          legs: best.combo,
          totalPricePerPerson,
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
