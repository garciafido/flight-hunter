export interface AirportTime {
  airport: string;
  time: string;
}

export interface FlightLeg {
  departure: AirportTime;
  arrival: AirportTime;
  airline: string;
  flightNumber: string;
  durationMinutes: number;
  stops: number;
}

export type StopoverResultLeg = 'outbound' | 'inbound';

export interface StopoverInfo {
  airport: string;
  arrivalTime: string;
  departureTime: string;
  durationDays: number;
  leg?: StopoverResultLeg;
}

export type FlightSource = 'kiwi' | 'skyscanner' | 'google-flights' | 'amadeus';
export type ProxyRegion = 'CL' | 'AR';

export interface FlightResult {
  searchId: string;
  source: FlightSource;
  outbound: FlightLeg;
  inbound: FlightLeg;
  stopover?: StopoverInfo;
  totalPrice: number;
  currency: string;
  pricePer: 'person' | 'total';
  passengers: number;
  carryOnIncluded: boolean;
  bookingUrl: string;
  scrapedAt: Date;
  proxyRegion: ProxyRegion;
  legIndex?: number; // optional; 0 for roundtrip (default), leg index for split mode
}
