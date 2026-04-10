import type { FlightResult, SearchFilters } from '@flight-hunter/shared';
import { normalizePricePerPerson } from '@flight-hunter/shared';

export interface FilterResult {
  passed: boolean;
  reason?: string;
}

export class FilterEngine {
  apply(flight: FlightResult, filters: SearchFilters): FilterResult {
    // Airline blacklist
    if (filters.airlineBlacklist.includes(flight.outbound.airline)) {
      return { passed: false, reason: `Airline ${flight.outbound.airline} is blacklisted` };
    }
    if (filters.airlineBlacklist.includes(flight.inbound.airline)) {
      return { passed: false, reason: `Airline ${flight.inbound.airline} is blacklisted` };
    }

    // Airport blacklist - check outbound departure and inbound arrival airports
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

    // Max total travel time (filter expressed in HOURS).
    // Skip when source returns 0 duration (e.g. Google Flights scraping)
    // or when the user set it to 0 (= unlimited).
    const totalTravelMinutes = flight.outbound.durationMinutes + flight.inbound.durationMinutes;
    const maxTravelMinutes = filters.maxTotalTravelTime * 60;
    if (totalTravelMinutes > 0 && maxTravelMinutes > 0 && totalTravelMinutes > maxTravelMinutes) {
      return {
        passed: false,
        reason: `Total travel time ${totalTravelMinutes}min exceeds max ${maxTravelMinutes}min`,
      };
    }

    // Max unplanned stops
    if (flight.outbound.stops > filters.maxUnplannedStops) {
      return {
        passed: false,
        reason: `Outbound stops ${flight.outbound.stops} exceeds max ${filters.maxUnplannedStops}`,
      };
    }
    if (flight.inbound.stops > filters.maxUnplannedStops) {
      return {
        passed: false,
        reason: `Inbound stops ${flight.inbound.stops} exceeds max ${filters.maxUnplannedStops}`,
      };
    }

    return { passed: true };
  }
}

// Re-export to avoid unused import warning
export { normalizePricePerPerson };
