import type { ProxyRegion } from './flight.js';

export type WaypointGap =
  | { type: 'stay'; minDays: number; maxDays: number }
  | { type: 'connection'; maxHours: number };

export interface Waypoint {
  airport: string;          // IATA code, e.g. 'LIM'
  gap: WaypointGap;
  pin?: 'first' | 'last';   // optional position pin
}

export interface TimeRange {
  earliest: string;
  latest: string;
}

export interface SearchFilters {
  airlineBlacklist: string[];
  airlinePreferred: string[];
  airportPreferred: Record<string, string[]>;
  airportBlacklist: Record<string, string[]>;
  departureTimeRange?: TimeRange;
  arrivalTimeRange?: TimeRange;
  maxUnplannedStops: number;
  requireCarryOn: boolean;
  requireCheckedBag?: boolean;
  maxTotalTravelTime: number;
}

export interface SearchAlertConfig {
  scoreThresholds: { info: number; good: number; urgent: number };
  maxPricePerPerson: number;
  targetPricePerPerson?: number;
  dreamPricePerPerson?: number;
  currency: string;
}

export interface SearchConfig {
  id: string;
  name: string;
  origin: string;             // IATA, e.g. 'BUE'
  departureFrom: Date;
  departureTo: Date;
  passengers: number;
  waypoints: Waypoint[];      // 1+ stops; trip always returns to origin
  maxConnectionHours: number; // global default for connection gaps
  proxyRegions: ProxyRegion[];
  scanIntervalMin: number;
  active: boolean;
  filters: SearchFilters;
  alertConfig: SearchAlertConfig;
}
