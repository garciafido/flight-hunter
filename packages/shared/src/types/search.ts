export type DestinationMode = 'single' | 'flexible';

export type StopoverLeg = 'outbound' | 'inbound' | 'any';

export interface StopoverConfig {
  airport: string;
  minDays: number;
  maxDays: number;
  leg?: StopoverLeg; // Defaults to 'any'
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
  minConnectionTime: number;
  maxConnectionTime: number;
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

export type SearchMode = 'roundtrip' | 'split';

export interface SearchLeg {
  origin: string;
  destination: string;
  departureFrom: Date;
  departureTo: Date;
  stopover?: StopoverConfig;
}

export interface SearchConfig {
  id: string;
  name: string;
  origin: string;
  destination: string;
  stopover?: StopoverConfig;
  departureFrom: Date;
  departureTo: Date;
  returnMinDays: number;
  returnMaxDays: number;
  passengers: number;
  filters: SearchFilters;
  alertConfig: SearchAlertConfig;
  proxyRegions: string[];
  scanIntervalMin: number;
  active: boolean;
  mode?: SearchMode; // defaults to 'roundtrip'
  legs?: SearchLeg[]; // only used when mode='split'
  destinationMode?: DestinationMode; // defaults to 'single'
  destinationCandidates?: string[]; // IATA codes or region preset keys
  windowMode?: boolean; // defaults to false
  windowDuration?: number; // trip length in days
  windowFlexibility?: number; // ± days around windowDuration
  maxCombos?: number; // cap for split mode combos, defaults to 100
}
