import type { Queue } from 'bullmq';
import type { PrismaClient } from '@flight-hunter/shared/db';
import type { FlightResult, AlertLevel, ScoreBreakdown } from '@flight-hunter/shared';
import type { AlertJob } from '@flight-hunter/shared';
import { estimateCarryOnUSD, estimateCheckedBagUSD, estimateArgentineTotalUSD } from '@flight-hunter/shared';
import { PriceAggregator } from './aggregation/price-aggregator.js';

export interface PublishPayload {
  flight: FlightResult;
  pricePerPerson: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  alertLevel: AlertLevel | null;
  suspicious?: boolean;
  suspicionReason?: string;
}

export class Publisher {
  private readonly aggregator: PriceAggregator;

  constructor(
    private readonly alertQueue: Queue,
    private readonly prisma: PrismaClient,
  ) {
    this.aggregator = new PriceAggregator(prisma);
  }

  async publish(payload: PublishPayload): Promise<void> {
    const { flight, pricePerPerson, score, scoreBreakdown, alertLevel, suspicious, suspicionReason } = payload;

    const priceTotal =
      flight.pricePer === 'total' ? flight.totalPrice : flight.totalPrice * flight.passengers;

    const isSuspicious = suspicious ?? false;

    const saved = await this.prisma.flightResult.create({
      data: {
        searchId: flight.searchId,
        source: flight.source,
        outbound: flight.outbound as object,
        inbound: flight.inbound as object,
        stopoverInfo: flight.stopover ? (flight.stopover as object) : undefined,
        pricePerPerson,
        priceTotal,
        currency: flight.currency,
        priceOriginal: flight.priceOriginal ?? priceTotal,
        currencyOriginal: flight.currencyOriginal ?? flight.currency,
        priceUsd: flight.priceUsd ?? priceTotal,
        exchangeRateAt: flight.exchangeRateAt ?? null,
        suspicious: isSuspicious,
        suspicionReason: suspicionReason ?? null,
        carryOnIncluded: flight.carryOnIncluded,
        bookingUrl: flight.bookingUrl,
        proxyRegion: flight.proxyRegion,
        score,
        scoreBreakdown: scoreBreakdown as object,
        alertLevel: alertLevel ?? undefined,
        scrapedAt: flight.scrapedAt,
      },
    });

    // Async aggregation: upsert daily price_history (non-blocking)
    void this.aggregator.aggregate(flight.searchId, saved.scrapedAt ?? new Date()).catch((err) => {
      console.error('PriceAggregator: failed to aggregate', err);
    });

    // Suspicious flights do not trigger alerts
    if (alertLevel && !isSuspicious) {
      const alertJob: AlertJob = {
        searchId: flight.searchId,
        flightResultId: saved.id,
        level: alertLevel,
        score,
        scoreBreakdown,
        flightSummary: {
          price: pricePerPerson,
          currency: flight.currency,
          airline: flight.outbound.airline,
          departureAirport: flight.outbound.departure.airport,
          arrivalAirport: flight.outbound.arrival.airport,
          departureTime: flight.outbound.departure.time,
          arrivalTime: flight.outbound.arrival.time,
          stopoverAirport: flight.stopover?.airport,
          stopoverDurationDays: flight.stopover?.durationDays,
          bookingUrl: flight.bookingUrl,
        },
      };

      await this.alertQueue.add('alert', alertJob);
    }
  }

  /**
   * Publish a combo alert for a waypoint-based N-leg trip.
   * The total price represents the sum of all leg prices per person.
   */
  async publishComboAlert(opts: {
    searchId: string;
    flightResultId: string;
    legs: FlightResult[];
    totalPricePerPerson: number;
    score: number;
    scoreBreakdown: ScoreBreakdown;
    alertLevel: AlertLevel;
    waypoints?: Array<{
      airport: string;
      type: 'stay' | 'connection';
      minDays?: number;
      maxDays?: number;
      maxHours?: number;
    }>;
    /** When true, populate per-leg and total carry-on cost estimates. */
    requireCarryOn?: boolean;
    /** Checked bags per passenger on outbound (non-final) legs. */
    outboundCheckedBags?: number;
    /** Checked bags per passenger on the final return leg. */
    returnCheckedBags?: number;
  }): Promise<void> {
    const {
      searchId, flightResultId, legs, totalPricePerPerson, score, scoreBreakdown,
      alertLevel, waypoints, requireCarryOn, outboundCheckedBags = 0,
      returnCheckedBags = 0,
    } = opts;
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];

    // All baggage costs are PER PERSON (consistent with totalPricePerPerson).
    // The user can mentally multiply by passengers if they want the group total.

    // Per-leg carry-on estimate (only when the user requested carry-on).
    const perLegCarryOn = requireCarryOn
      ? legs.map((l) => estimateCarryOnUSD(l.outbound.airline))
      : undefined;
    const totalCarryOn = perLegCarryOn?.reduce((a, b) => a + b, 0);

    // Per-leg checked-bag estimate. Outbound bags apply to all legs except
    // the last; return bags only apply to the last.
    const lastIdx = legs.length - 1;
    const perLegCheckedBag = legs.map((l, i) => {
      const bags = i === lastIdx ? returnCheckedBags : outboundCheckedBags;
      if (bags === 0) return 0;
      return estimateCheckedBagUSD(l.outbound.airline) * bags;
    });
    const totalCheckedBag = perLegCheckedBag.reduce((a, b) => a + b, 0);
    const checkedBagFieldOrUndefined = totalCheckedBag > 0 ? totalCheckedBag : undefined;

    // Argentine total: includes baggage extras (you pay them too with the same card).
    const trueTotalUSD = totalPricePerPerson + (totalCarryOn ?? 0) + totalCheckedBag;
    const argTotal = estimateArgentineTotalUSD(trueTotalUSD);

    const alertJob: AlertJob = {
      searchId,
      flightResultId,
      level: alertLevel,
      score,
      scoreBreakdown,
      flightSummary: {
        price: totalPricePerPerson,
        currency: firstLeg.currency,
        airline: firstLeg.outbound.airline,
        departureAirport: firstLeg.outbound.departure.airport,
        arrivalAirport: lastLeg.outbound.arrival.airport,
        departureTime: firstLeg.outbound.departure.time,
        arrivalTime: lastLeg.outbound.arrival.time,
        bookingUrl: firstLeg.bookingUrl,
      },
      combo: {
        legs: legs.map((l, i) => ({
          price: l.totalPrice,
          currency: l.currency,
          airline: l.outbound.airline,
          departureAirport: l.outbound.departure.airport,
          arrivalAirport: l.outbound.arrival.airport,
          departureTime: l.outbound.departure.time,
          arrivalTime: l.outbound.arrival.time,
          bookingUrl: l.bookingUrl,
          durationMinutes: l.outbound.durationMinutes,
          ...(perLegCarryOn !== undefined ? { carryOnEstimateUSD: perLegCarryOn[i] } : {}),
          ...(perLegCheckedBag[i] > 0 ? { checkedBagEstimateUSD: perLegCheckedBag[i] } : {}),
        })),
        totalPrice: totalPricePerPerson,
        ...(waypoints ? { waypoints } : {}),
        ...(totalCarryOn !== undefined ? { carryOnEstimateUSD: totalCarryOn } : {}),
        ...(checkedBagFieldOrUndefined !== undefined ? { checkedBagEstimateUSD: checkedBagFieldOrUndefined } : {}),
        argTaxEstimateUSD: argTotal,
      },
    };

    await this.alertQueue.add('alert', alertJob);
  }
}
