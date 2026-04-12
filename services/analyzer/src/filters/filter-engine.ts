import type { FlightResult, SearchFilters } from '@flight-hunter/shared';
import { normalizePricePerPerson } from '@flight-hunter/shared';

export interface FilterResult {
  passed: boolean;
  reason?: string;
}

export interface FilterOptions {
  /** Global max connection hours from SearchConfig. Used to reject flights
   *  with excessive layovers (duration way longer than expected flying time). */
  maxConnectionHours?: number;
}

export class FilterEngine {
  apply(flight: FlightResult, filters: SearchFilters, options?: FilterOptions): FilterResult {
    // Airline blacklist
    if (filters.airlineBlacklist.includes(flight.outbound.airline)) {
      return { passed: false, reason: `Airline ${flight.outbound.airline} is blacklisted` };
    }
    if (filters.airlineBlacklist.includes(flight.inbound.airline)) {
      return { passed: false, reason: `Airline ${flight.inbound.airline} is blacklisted` };
    }

    // Airport blacklist
    const outboundDep = flight.outbound.departure.airport;
    const outboundArr = flight.outbound.arrival.airport;
    const inboundDep = flight.inbound.departure.airport;
    const inboundArr = flight.inbound.arrival.airport;

    for (const [, airports] of Object.entries(filters.airportBlacklist)) {
      if (airports.includes(outboundDep)) {
        return { passed: false, reason: `Airport ${outboundDep} is blacklisted` };
      }
      if (airports.includes(outboundArr)) {
        return { passed: false, reason: `Airport ${outboundArr} is blacklisted` };
      }
      if (airports.includes(inboundDep)) {
        return { passed: false, reason: `Airport ${inboundDep} is blacklisted` };
      }
      if (airports.includes(inboundArr)) {
        return { passed: false, reason: `Airport ${inboundArr} is blacklisted` };
      }
    }

    // Carry-on required
    if (filters.requireCarryOn && !flight.carryOnIncluded) {
      return { passed: false, reason: 'Carry-on not included' };
    }

    // Max unplanned stops
    if (flight.outbound.stops > filters.maxUnplannedStops) {
      return {
        passed: false,
        reason: `Outbound stops ${flight.outbound.stops} exceeds max ${filters.maxUnplannedStops}`,
      };
    }

    // Max layover: for flights with stops, reject if the total duration implies
    // an excessive layover. Heuristic: a flight with N stops should take at most
    // (N+1) × maxConnectionHours. E.g., 1-stop flight with maxConnectionHours=6
    // → max total ~12h. A 14-hour flight with 1 stop is rejected.
    const maxConnHours = options?.maxConnectionHours;
    const legDuration = flight.outbound.durationMinutes;
    if (maxConnHours && maxConnHours > 0 && flight.outbound.stops > 0 && legDuration > 0) {
      const maxDurationMinutes = (flight.outbound.stops + 1) * maxConnHours * 60;
      if (legDuration > maxDurationMinutes) {
        return {
          passed: false,
          reason: `Flight ${legDuration}min with ${flight.outbound.stops} stop(s) exceeds max layover estimate (${maxDurationMinutes}min for maxConnection=${maxConnHours}h)`,
        };
      }
    }

    return { passed: true };
  }
}

// Re-export to avoid unused import warning
export { normalizePricePerPerson };
