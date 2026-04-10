export interface AirlineRating {
  iata: string;
  name: string;
  rating: number;        // 0-100
  punctuality: number;   // 0-100 (on-time arrival rate)
  baggageCarryOn: 'included' | 'paid' | 'restricted';
  changePolicy: 'free' | 'paid' | 'no-changes';
  region: 'latam' | 'americas' | 'europe' | 'asia' | 'global';
}

export const AIRLINE_RATINGS: Record<string, AirlineRating> = {
  LA: { iata: 'LA', name: 'LATAM', rating: 78, punctuality: 82, baggageCarryOn: 'included', changePolicy: 'paid', region: 'latam' },
  AR: { iata: 'AR', name: 'Aerolíneas Argentinas', rating: 70, punctuality: 75, baggageCarryOn: 'included', changePolicy: 'paid', region: 'latam' },
  AV: { iata: 'AV', name: 'Avianca', rating: 72, punctuality: 78, baggageCarryOn: 'included', changePolicy: 'paid', region: 'latam' },
  CM: { iata: 'CM', name: 'Copa Airlines', rating: 80, punctuality: 84, baggageCarryOn: 'included', changePolicy: 'paid', region: 'latam' },
  G3: { iata: 'G3', name: 'GOL', rating: 68, punctuality: 72, baggageCarryOn: 'included', changePolicy: 'paid', region: 'latam' },
  AD: { iata: 'AD', name: 'Azul', rating: 75, punctuality: 80, baggageCarryOn: 'included', changePolicy: 'paid', region: 'latam' },
  JA: { iata: 'JA', name: 'JetSMART', rating: 60, punctuality: 70, baggageCarryOn: 'restricted', changePolicy: 'paid', region: 'latam' },
  H2: { iata: 'H2', name: 'Sky Airline', rating: 62, punctuality: 73, baggageCarryOn: 'restricted', changePolicy: 'paid', region: 'latam' },
  AA: { iata: 'AA', name: 'American Airlines', rating: 75, punctuality: 80, baggageCarryOn: 'included', changePolicy: 'paid', region: 'americas' },
  DL: { iata: 'DL', name: 'Delta', rating: 82, punctuality: 85, baggageCarryOn: 'included', changePolicy: 'free', region: 'americas' },
  UA: { iata: 'UA', name: 'United', rating: 73, punctuality: 78, baggageCarryOn: 'included', changePolicy: 'paid', region: 'americas' },
  IB: { iata: 'IB', name: 'Iberia', rating: 76, punctuality: 80, baggageCarryOn: 'included', changePolicy: 'paid', region: 'europe' },
  AF: { iata: 'AF', name: 'Air France', rating: 78, punctuality: 81, baggageCarryOn: 'included', changePolicy: 'paid', region: 'europe' },
  LH: { iata: 'LH', name: 'Lufthansa', rating: 80, punctuality: 84, baggageCarryOn: 'included', changePolicy: 'paid', region: 'europe' },
  KL: { iata: 'KL', name: 'KLM', rating: 79, punctuality: 83, baggageCarryOn: 'included', changePolicy: 'paid', region: 'europe' },
  NK: { iata: 'NK', name: 'Spirit Airlines', rating: 55, punctuality: 68, baggageCarryOn: 'paid', changePolicy: 'no-changes', region: 'americas' },
  FR: { iata: 'FR', name: 'Ryanair', rating: 58, punctuality: 72, baggageCarryOn: 'paid', changePolicy: 'no-changes', region: 'europe' },
};

export function getAirlineRating(iataOrName: string): AirlineRating | undefined {
  // Try IATA code first (2 letters)
  const upper = iataOrName.toUpperCase();
  if (AIRLINE_RATINGS[upper]) return AIRLINE_RATINGS[upper];
  // Fallback: search by name (case-insensitive substring)
  const lower = iataOrName.toLowerCase();
  return Object.values(AIRLINE_RATINGS).find((r) => r.name.toLowerCase().includes(lower));
}
