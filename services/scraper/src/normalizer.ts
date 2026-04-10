import type { FlightResult, FlightLeg, StopoverInfo, ProxyRegion } from '@flight-hunter/shared';

// ─── Kiwi ────────────────────────────────────────────────────────────────────

export interface KiwiRoute {
  flyFrom: string;
  flyTo: string;
  local_departure: string;
  local_arrival: string;
  airline: string;
  flight_no: number;
  return: 0 | 1; // 0 = outbound, 1 = inbound
}

export interface KiwiData {
  id: string;
  flyFrom: string;
  flyTo: string;
  local_departure: string;
  local_arrival: string;
  price: number;
  currency?: string;
  fare: { adults: number };
  bags_price: { hand: number };
  route: KiwiRoute[];
  deep_link: string;
}

function routeDuration(routes: KiwiRoute[]): number {
  /* v8 ignore next */
  if (routes.length === 0) return 0;
  const dep = new Date(routes[0].local_departure).getTime();
  const arr = new Date(routes[routes.length - 1].local_arrival).getTime();
  return Math.round((arr - dep) / 60000);
}

function detectStopover(
  routes: KiwiRoute[],
  leg: 'outbound' | 'inbound',
): StopoverInfo | undefined {
  for (let i = 0; i < routes.length - 1; i++) {
    const arrivalTime = new Date(routes[i].local_arrival).getTime();
    const departureTime = new Date(routes[i + 1].local_departure).getTime();
    const gapHours = (departureTime - arrivalTime) / 3600000;
    if (gapHours > 24) {
      const durationDays = Math.round(gapHours / 24);
      return {
        airport: routes[i].flyTo,
        arrivalTime: routes[i].local_arrival,
        departureTime: routes[i + 1].local_departure,
        durationDays,
        leg,
      };
    }
  }
  return undefined;
}

export function normalizeKiwiResult(
  data: KiwiData,
  searchId: string,
  passengers: number,
  proxyRegion: ProxyRegion,
): FlightResult {
  const outboundRoutes = data.route.filter((r) => r.return === 0);
  const inboundRoutes = data.route.filter((r) => r.return === 1);

  const outboundFirst = outboundRoutes[0];
  const outboundLast = outboundRoutes[outboundRoutes.length - 1];
  const inboundFirst = inboundRoutes[0];
  const inboundLast = inboundRoutes[inboundRoutes.length - 1];

  const outbound: FlightLeg = {
    departure: { airport: outboundFirst.flyFrom, time: outboundFirst.local_departure },
    arrival: { airport: outboundLast.flyTo, time: outboundLast.local_arrival },
    airline: outboundFirst.airline,
    flightNumber: `${outboundFirst.airline}${outboundFirst.flight_no}`,
    durationMinutes: routeDuration(outboundRoutes),
    stops: Math.max(0, outboundRoutes.length - 1),
  };

  const inbound: FlightLeg = {
    departure: { airport: inboundFirst.flyFrom, time: inboundFirst.local_departure },
    arrival: { airport: inboundLast.flyTo, time: inboundLast.local_arrival },
    airline: inboundFirst.airline,
    flightNumber: `${inboundFirst.airline}${inboundFirst.flight_no}`,
    durationMinutes: routeDuration(inboundRoutes),
    stops: Math.max(0, inboundRoutes.length - 1),
  };

  const stopover =
    detectStopover(outboundRoutes, 'outbound') ?? detectStopover(inboundRoutes, 'inbound');

  return {
    searchId,
    source: 'kiwi',
    outbound,
    inbound,
    stopover,
    totalPrice: data.price,
    currency: data.currency ?? 'USD',
    pricePer: 'total',
    passengers,
    carryOnIncluded: data.bags_price.hand === 0,
    bookingUrl: data.deep_link,
    scrapedAt: new Date(),
    proxyRegion,
  };
}

// ─── Amadeus ─────────────────────────────────────────────────────────────────

export interface AmadeusSegment {
  departure: { iataCode: string; at: string };
  arrival: { iataCode: string; at: string };
  carrierCode: string;
  number: string;
  duration: string; // ISO 8601 duration e.g. "PT5H30M"
}

export interface AmadeusItinerary {
  duration: string;
  segments: AmadeusSegment[];
}

export interface AmadeusOffer {
  id: string;
  itineraries: AmadeusItinerary[];
  price: { total: string; currency: string };
  travelerPricings: Array<{
    fareDetailsBySegment: Array<{
      cabin: string;
      includedCheckedBags?: { quantity?: number };
    }>;
  }>;
}

function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  return (parseInt(match[1] ?? '0', 10) * 60) + parseInt(match[2] ?? '0', 10);
}

export function normalizeAmadeusResult(
  offer: AmadeusOffer,
  searchId: string,
  passengers: number,
  proxyRegion: ProxyRegion,
): FlightResult {
  const outItinerary = offer.itineraries[0];
  const inItinerary = offer.itineraries[1];

  const outSegments = outItinerary.segments;
  const inSegments = inItinerary.segments;

  const outFirst = outSegments[0];
  const outLast = outSegments[outSegments.length - 1];
  const inFirst = inSegments[0];
  const inLast = inSegments[inSegments.length - 1];

  const outbound: FlightLeg = {
    departure: { airport: outFirst.departure.iataCode, time: outFirst.departure.at },
    arrival: { airport: outLast.arrival.iataCode, time: outLast.arrival.at },
    airline: outFirst.carrierCode,
    flightNumber: `${outFirst.carrierCode}${outFirst.number}`,
    durationMinutes: parseIsoDuration(outItinerary.duration),
    stops: Math.max(0, outSegments.length - 1),
  };

  const inbound: FlightLeg = {
    departure: { airport: inFirst.departure.iataCode, time: inFirst.departure.at },
    arrival: { airport: inLast.arrival.iataCode, time: inLast.arrival.at },
    airline: inFirst.carrierCode,
    flightNumber: `${inFirst.carrierCode}${inFirst.number}`,
    durationMinutes: parseIsoDuration(inItinerary.duration),
    stops: Math.max(0, inSegments.length - 1),
  };

  // Detect stopover (gap > 24h between consecutive segments) in outbound or inbound
  function findGap(segments: AmadeusSegment[], leg: 'outbound' | 'inbound'): StopoverInfo | undefined {
    for (let i = 0; i < segments.length - 1; i++) {
      const arrTime = new Date(segments[i].arrival.at).getTime();
      const depTime = new Date(segments[i + 1].departure.at).getTime();
      const gapHours = (depTime - arrTime) / 3600000;
      if (gapHours > 24) {
        return {
          airport: segments[i].arrival.iataCode,
          arrivalTime: segments[i].arrival.at,
          departureTime: segments[i + 1].departure.at,
          durationDays: Math.round(gapHours / 24),
          leg,
        };
      }
    }
    return undefined;
  }
  const stopover = findGap(outSegments, 'outbound') ?? findGap(inSegments, 'inbound');

  return {
    searchId,
    source: 'amadeus',
    outbound,
    inbound,
    stopover,
    totalPrice: parseFloat(offer.price.total),
    currency: offer.price.currency,
    pricePer: 'total',
    passengers,
    carryOnIncluded: true, // Amadeus economy always includes carry-on
    bookingUrl: `https://www.amadeus.com/flight/${offer.id}`,
    scrapedAt: new Date(),
    proxyRegion,
  };
}

// ─── Skyscanner ───────────────────────────────────────────────────────────────

export interface SkyscannerLeg {
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  durationInMinutes: number;
  stopCount: number;
  carriers: string[];
  flightNumbers: string[];
}

export interface SkyscannerData {
  id: string;
  price: number;
  currency: string;
  outbound: SkyscannerLeg;
  inbound: SkyscannerLeg;
  bookingUrl: string;
}

export function normalizeSkyscannerResult(
  data: SkyscannerData,
  searchId: string,
  passengers: number,
  proxyRegion: ProxyRegion,
): FlightResult {
  const outbound: FlightLeg = {
    departure: { airport: data.outbound.origin, time: data.outbound.departure },
    arrival: { airport: data.outbound.destination, time: data.outbound.arrival },
    airline: data.outbound.carriers[0] ?? '',
    flightNumber: data.outbound.flightNumbers[0] ?? '',
    durationMinutes: data.outbound.durationInMinutes,
    stops: data.outbound.stopCount,
  };

  const inbound: FlightLeg = {
    departure: { airport: data.inbound.origin, time: data.inbound.departure },
    arrival: { airport: data.inbound.destination, time: data.inbound.arrival },
    airline: data.inbound.carriers[0] ?? '',
    flightNumber: data.inbound.flightNumbers[0] ?? '',
    durationMinutes: data.inbound.durationInMinutes,
    stops: data.inbound.stopCount,
  };

  return {
    searchId,
    source: 'skyscanner',
    outbound,
    inbound,
    totalPrice: data.price,
    currency: data.currency,
    pricePer: 'total',
    passengers,
    carryOnIncluded: false,
    bookingUrl: data.bookingUrl,
    scrapedAt: new Date(),
    proxyRegion,
  };
}

// ─── Travelpayouts ────────────────────────────────────────────────────────────

export interface TravelpayoutsData {
  value: number;
  trip_class: number;
  show_to_affiliates: boolean;
  return_date: string;
  origin: string;
  destination: string;
  depart_date: string;
  number_of_changes: number;
  gate: string;
  found_at: string;
  duration: number; // total trip duration in minutes
  distance: number;
  actual: boolean;
}

export function normalizeTravelpayoutsResult(
  data: TravelpayoutsData,
  currency: string,
  searchId: string,
  passengers: number,
  proxyRegion: ProxyRegion,
): FlightResult {
  // Travelpayouts /v2/prices/latest doesn't give per-segment times.
  // We use depart_date and return_date as approximate times (midnight UTC).
  const departureTime = `${data.depart_date}T00:00:00.000Z`;
  const returnTime = `${data.return_date}T00:00:00.000Z`;

  const airline = data.gate ?? 'Unknown';

  const outbound: FlightLeg = {
    departure: { airport: data.origin, time: departureTime },
    arrival: { airport: data.destination, time: departureTime },
    airline,
    flightNumber: '',
    durationMinutes: Math.round(data.duration / 2), // approximate: half of round-trip
    stops: data.number_of_changes,
  };

  const inbound: FlightLeg = {
    departure: { airport: data.destination, time: returnTime },
    arrival: { airport: data.origin, time: returnTime },
    airline,
    flightNumber: '',
    durationMinutes: Math.round(data.duration / 2),
    stops: data.number_of_changes,
  };

  const normalizedCurrency = currency.toUpperCase();

  return {
    searchId,
    source: 'travelpayouts',
    outbound,
    inbound,
    totalPrice: data.value,
    currency: normalizedCurrency,
    pricePer: 'total',
    passengers,
    carryOnIncluded: false,
    bookingUrl: `https://www.aviasales.com/search/${data.origin}${data.depart_date.replace(/-/g, '')}${data.destination}${data.return_date.replace(/-/g, '')}1`,
    scrapedAt: new Date(),
    proxyRegion,
    priceOriginal: data.value,
    currencyOriginal: normalizedCurrency,
  };
}

// ─── Duffel ───────────────────────────────────────────────────────────────────

export interface DuffelSegment {
  departing_at: string;
  arriving_at: string;
  origin: { iata_code: string };
  destination: { iata_code: string };
  operating_carrier: { iata_code: string };
  operating_carrier_flight_number: string;
  duration: string; // ISO 8601 e.g. "PT5H30M"
}

export interface DuffelSlice {
  duration: string;
  origin: { iata_code: string };
  destination: { iata_code: string };
  segments: DuffelSegment[];
}

export interface DuffelOffer {
  id: string;
  total_amount: string;
  total_currency: string;
  slices: DuffelSlice[];
}

function parseDuffelDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  return (parseInt(match[1] ?? '0', 10) * 60) + parseInt(match[2] ?? '0', 10);
}

export function normalizeDuffelResult(
  offer: DuffelOffer,
  searchId: string,
  passengers: number,
  proxyRegion: ProxyRegion,
): FlightResult {
  const outSlice = offer.slices[0];
  const inSlice = offer.slices[1];

  function sliceToLeg(slice: DuffelSlice): FlightLeg {
    const first = slice.segments[0];
    const last = slice.segments[slice.segments.length - 1];
    return {
      departure: { airport: first.origin.iata_code, time: first.departing_at },
      arrival: { airport: last.destination.iata_code, time: last.arriving_at },
      airline: first.operating_carrier.iata_code,
      flightNumber: `${first.operating_carrier.iata_code}${first.operating_carrier_flight_number}`,
      durationMinutes: parseDuffelDuration(slice.duration),
      stops: Math.max(0, slice.segments.length - 1),
    };
  }

  const outbound = sliceToLeg(outSlice);
  const inbound = sliceToLeg(inSlice);

  const currency = offer.total_currency.toUpperCase();
  const totalPrice = parseFloat(offer.total_amount);

  return {
    searchId,
    source: 'duffel',
    outbound,
    inbound,
    totalPrice,
    currency,
    pricePer: 'total',
    passengers,
    carryOnIncluded: false,
    bookingUrl: `https://app.duffel.com/search/${offer.id}`,
    scrapedAt: new Date(),
    proxyRegion,
    priceOriginal: totalPrice,
    currencyOriginal: currency,
  };
}
