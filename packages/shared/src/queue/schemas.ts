/* v8 ignore next */
import { z } from 'zod';

const AirportTimeSchema = z.object({
  airport: z.string(),
  time: z.string(),
});

const FlightLegSchema = z.object({
  departure: AirportTimeSchema,
  arrival: AirportTimeSchema,
  airline: z.string(),
  flightNumber: z.string(),
  durationMinutes: z.number(),
  stops: z.number(),
});

const StopoverInfoSchema = z.object({
  airport: z.string(),
  arrivalTime: z.string().datetime(),
  departureTime: z.string().datetime(),
  durationDays: z.number(),
});

export const RawResultJobSchema = z.object({
  searchId: z.string(),
  source: z.enum(['kiwi', 'skyscanner', 'google-flights', 'amadeus', 'travelpayouts', 'duffel']),
  outbound: FlightLegSchema,
  inbound: FlightLegSchema,
  stopover: StopoverInfoSchema.optional(),
  totalPrice: z.number(),
  currency: z.string().length(3),
  pricePer: z.enum(['person', 'total']),
  passengers: z.number().int().positive(),
  carryOnIncluded: z.boolean(),
  bookingUrl: z.string().url(),
  scrapedAt: z.string().datetime(),
  proxyRegion: z.enum(['CL', 'AR']),
  legIndex: z.number().int().min(0).default(0),
  planIndex: z.number().int().min(0).default(0),
  // Currency conversion fields (optional; populated after exchange rate lookup)
  priceOriginal: z.number().optional(),
  currencyOriginal: z.string().length(3).optional(),
  priceUsd: z.number().optional(),
  exchangeRateAt: z.string().datetime().optional(),
});

export type RawResultJob = z.infer<typeof RawResultJobSchema>;

const ScoreBreakdownSchema = z.object({
  price: z.number().min(0).max(100),
  schedule: z.number().min(0).max(100),
  stopover: z.number().min(0).max(100),
  airline: z.number().min(0).max(100),
  flexibility: z.number().min(0).max(100),
});

const FlightSummarySchema = z.object({
  price: z.number(),
  currency: z.string().length(3),
  airline: z.string(),
  departureAirport: z.string(),
  arrivalAirport: z.string(),
  departureTime: z.string().datetime(),
  arrivalTime: z.string().datetime(),
  stopoverAirport: z.string().optional(),
  stopoverDurationDays: z.number().optional(),
  bookingUrl: z.string().url(),
});

export const AlertJobSchema = z.object({
  searchId: z.string(),
  flightResultId: z.string(),
  level: z.enum(['info', 'good', 'urgent']),
  score: z.number().min(0).max(100),
  scoreBreakdown: ScoreBreakdownSchema,
  flightSummary: FlightSummarySchema,
  combo: z.object({
    legs: z.array(FlightSummarySchema.extend({
      // Optional flight duration in minutes (only set when the source had real times).
      durationMinutes: z.number().optional(),
    })),
    totalPrice: z.number(),
    plan: z.object({
      position: z.enum(['start', 'end', 'any']),
      airport: z.string(),
      days: z.number(),
    }).optional(),
  }).optional(),
});

export type AlertJob = z.infer<typeof AlertJobSchema>;
