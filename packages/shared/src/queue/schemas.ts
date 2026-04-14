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
  source: z.literal('google-flights'),
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
      // Worst-case carry-on cost estimate (USD per pax), only when requireCarryOn=true.
      carryOnEstimateUSD: z.number().optional(),
      // Checked-bag cost estimate (USD per pax) for the bags configured on this leg.
      checkedBagEstimateUSD: z.number().optional(),
      // Despegar.com one-way search URL for this leg (origin/dest/date/pax).
      despegarUrl: z.string().url().optional(),
    })),
    totalPrice: z.number(),
    waypoints: z.array(z.object({
      airport: z.string(),
      type: z.enum(['stay', 'connection']),
      minDays: z.number().optional(),
      maxDays: z.number().optional(),
      maxHours: z.number().optional(),
    })).optional(),
    // Sum of carry-on estimates across all legs (USD per pax), only when requireCarryOn=true.
    carryOnEstimateUSD: z.number().optional(),
    // Sum of checked-bag estimates across all legs (USD per pax), only when bags > 0.
    checkedBagEstimateUSD: z.number().optional(),
    // Grand totals for the entire group (all pax, all legs, all baggage).
    // This is THE number the user cares about: "how much does this trip cost me".
    groupTotalUSD: z.number().optional(),
    // Same but with Argentine taxes applied (PAIS + RG 5232).
    groupTotalWithTaxUSD: z.number().optional(),
    // Legacy per-person estimate (kept for backwards compat, may be misleading
    // when legs have different passenger counts).
    argTaxEstimateUSD: z.number().optional(),
  }).optional(),
});

export type AlertJob = z.infer<typeof AlertJobSchema>;

export const EvaluateCombosJobSchema = z.object({
  searchId: z.string(),
});

export type EvaluateCombosJob = z.infer<typeof EvaluateCombosJobSchema>;
