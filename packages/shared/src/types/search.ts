import type { ProxyRegion } from './flight.js';

export type WaypointGap =
  | { type: 'stay'; minDays: number; maxDays: number }
  | { type: 'connection'; maxHours: number };

export interface Waypoint {
  airport: string;          // IATA code, e.g. 'LIM'
  gap: WaypointGap;
  /**
   * Checked bags per passenger to bring on the leg ARRIVING at this waypoint.
   * Default 0. Used by the analyzer to compute baggage cost per leg.
   */
  checkedBags?: number;
  /**
   * Override the global passenger count for the leg arriving at this waypoint.
   * Omit or null to inherit from SearchConfig.passengers.
   * Example: 2 people go to LIM, but only 1 continues to CUZ.
   */
  passengers?: number;
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
  // Checked bags per passenger on the FINAL leg back to origin.
  // (Outbound bags are now configured per-waypoint via Waypoint.checkedBags.)
  returnCheckedBags?: number;
  // Override passenger count for the final return leg. Omit to inherit global.
  returnPassengers?: number;
  // Hard deadline: the return flight must depart on or before this date.
  // Omit = no deadline (derived from waypoint stays + departure window).
  returnBy?: Date;
  proxyRegions: ProxyRegion[];
  scanIntervalMin: number;
  active: boolean;
  filters: SearchFilters;
  alertConfig: SearchAlertConfig;

  // ----- Orthogonal features preserved from prior phases -----
  // Multi-destination search: when 'flexible', the engine expands the
  // destinationCandidates list and runs the full waypoint analysis once
  // per candidate (treating each as a substitution for the last waypoint).
  destinationMode?: 'single' | 'flexible';
  destinationCandidates?: string[];

  // Window mode: alternative date-window expression. When true, departureFrom/To
  // is the outer window and windowDuration is the trip length to slide.
  // Note: with waypoints the trip duration is mostly derived from stays,
  // so windowMode is only useful when stays don't fully constrain it.
  windowMode?: boolean;
  windowDuration?: number;
  windowFlexibility?: number;

  // Cap on the number of combos the analyzer will evaluate per search tick.
  maxCombos?: number;
}
