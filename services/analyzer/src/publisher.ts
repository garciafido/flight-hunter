import type { Queue } from 'bullmq';
import type { PrismaClient } from '@flight-hunter/shared/db';
import type { FlightResult, AlertLevel, ScoreBreakdown } from '@flight-hunter/shared';
import type { AlertJob } from '@flight-hunter/shared';
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
        legIndex: flight.legIndex ?? 0,
        planIndex: flight.planIndex ?? 0,
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
  }): Promise<void> {
    const { searchId, flightResultId, legs, totalPricePerPerson, score, scoreBreakdown, alertLevel, waypoints } = opts;
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];

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
        legs: legs.map((l) => ({
          price: l.totalPrice,
          currency: l.currency,
          airline: l.outbound.airline,
          departureAirport: l.outbound.departure.airport,
          arrivalAirport: l.outbound.arrival.airport,
          departureTime: l.outbound.departure.time,
          arrivalTime: l.outbound.arrival.time,
          bookingUrl: l.bookingUrl,
          durationMinutes: l.outbound.durationMinutes,
        })),
        totalPrice: totalPricePerPerson,
        ...(waypoints ? { waypoints } : {}),
      },
    };

    await this.alertQueue.add('alert', alertJob);
  }
}
