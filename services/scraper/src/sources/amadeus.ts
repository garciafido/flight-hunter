import type { FlightResult, SearchConfig, ProxyRegion } from '@flight-hunter/shared';
import type { FlightSource } from './base-source.js';
import { normalizeAmadeusResult } from '../normalizer.js';
import type { AmadeusOffer } from '../normalizer.js';

const TOKEN_URL = 'https://api.amadeus.com/v1/security/oauth2/token';
const SEARCH_URL = 'https://api.amadeus.com/v2/shopping/flight-offers';

function formatDate(d: Date): string {
  return new Date(d).toISOString().split('T')[0];
}

export class AmadeusSource implements FlightSource {
  readonly name = 'amadeus';
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  private async authenticate(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.apiKey,
        client_secret: this.apiSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Amadeus auth failed: ${response.status}`);
    }

    const json = (await response.json()) as { access_token: string; expires_in: number };
    this.token = json.access_token;
    this.tokenExpiresAt = Date.now() + (json.expires_in - 60) * 1000;
    return this.token;
  }

  async search(config: SearchConfig, proxyUrl: string | null): Promise<FlightResult[]> {
    if (!this.apiKey || !this.apiSecret) return [];

    try {
      const token = await this.authenticate();

      const returnDate = new Date(config.departureFrom);
      returnDate.setDate(returnDate.getDate() + config.returnMinDays);

      const params = new URLSearchParams({
        originLocationCode: config.origin,
        destinationLocationCode: config.destination,
        departureDate: formatDate(config.departureFrom),
        returnDate: formatDate(returnDate),
        adults: String(config.passengers),
        currencyCode: config.alertConfig.currency,
        max: '50',
      });

      const response = await fetch(`${SEARCH_URL}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return [];

      const json = (await response.json()) as { data: AmadeusOffer[] };
      const proxyRegion = (config.proxyRegions[0] ?? 'CL') as ProxyRegion;

      return (json.data ?? []).map((offer) =>
        normalizeAmadeusResult(offer, config.id, config.passengers, proxyRegion),
      );
    } catch {
      return [];
    }
  }
}
