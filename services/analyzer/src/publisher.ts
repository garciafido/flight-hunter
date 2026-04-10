import type { Queue } from 'bullmq';
import type { PrismaClient } from '@flight-hunter/shared';
import type { FlightResult, AlertLevel, ScoreBreakdown } from '@flight-hunter/shared';
import type { AlertJob } from '@flight-hunter/shared';

export interface PublishPayload {
  flight: FlightResult;
  pricePerPerson: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  alertLevel: AlertLevel | null;
}

export class Publisher {
  constructor(
    private readonly alertQueue: Queue,
    private readonly prisma: PrismaClient,
  ) {}

  async publish(payload: PublishPayload): Promise<void> {
    const { flight, pricePerPerson, score, scoreBreakdown, alertLevel } = payload;

    const priceTotal =
      flight.pricePer === 'total' ? flight.totalPrice : flight.totalPrice * flight.passengers;

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
        carryOnIncluded: flight.carryOnIncluded,
        bookingUrl: flight.bookingUrl,
        proxyRegion: flight.proxyRegion,
        score,
        scoreBreakdown: scoreBreakdown as object,
        alertLevel: alertLevel ?? undefined,
        legIndex: flight.legIndex ?? 0,
        scrapedAt: flight.scrapedAt,
      },
    });

    if (alertLevel) {
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
}
