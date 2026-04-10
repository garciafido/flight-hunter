import type { FlightResult, SearchConfig, ProxyRegion } from '@flight-hunter/shared';
import type { FlightSource } from './base-source.js';
import { normalizeSkyscannerResult } from '../normalizer.js';
import type { SkyscannerData } from '../normalizer.js';

export class SkyscannerSource implements FlightSource {
  readonly name = 'skyscanner';

  constructor(private readonly rapidApiKey: string) {}

  async search(config: SearchConfig, proxyUrl: string | null): Promise<FlightResult[]> {
    try {
      const { origin, destination, departureFrom, departureTo, returnMinDays, returnMaxDays, passengers } = config;

      const formatDate = (d: Date) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      const returnFrom = new Date(departureFrom);
      returnFrom.setDate(returnFrom.getDate() + returnMinDays);
      const returnTo = new Date(departureTo);
      returnTo.setDate(returnTo.getDate() + returnMaxDays);

      const params = new URLSearchParams({
        origin,
        destination,
        departureDate: formatDate(new Date(departureFrom)),
        returnDate: formatDate(returnFrom),
        adults: String(passengers),
        currency: 'USD',
      });

      const fetchOptions: RequestInit & Record<string, unknown> = {
        headers: {
          'x-rapidapi-key': this.rapidApiKey,
          'x-rapidapi-host': 'skyscanner80.p.rapidapi.com',
        },
      };

      if (proxyUrl) {
        fetchOptions['proxyUrl'] = proxyUrl;
      }

      const response = await fetch(
        `https://skyscanner80.p.rapidapi.com/api/v1/flights/searchFlightsComplete?${params.toString()}`,
        fetchOptions,
      );

      if (!response.ok) {
        return [];
      }

      const json = (await response.json()) as { data: SkyscannerData[] };
      const proxyRegion = (config.proxyRegions[0] ?? 'CL') as ProxyRegion;

      return Promise.all(
        json.data.map((item) =>
          normalizeSkyscannerResult(item, config.id, config.passengers, proxyRegion),
        ),
      );
    } catch {
      return [];
    }
  }
}
