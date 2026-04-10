import type { FlightResult, SearchConfig, ProxyRegion } from '@flight-hunter/shared';
import type { FlightSource } from './base-source.js';
import { normalizeKiwiResult } from '../normalizer.js';
import type { KiwiData } from '../normalizer.js';

export class KiwiSource implements FlightSource {
  readonly name = 'kiwi';

  constructor(private readonly apiKey: string) {}

  async search(config: SearchConfig, proxyUrl: string | null): Promise<FlightResult[]> {
    try {
      const { origin, destination, departureFrom, departureTo, returnMinDays, returnMaxDays, passengers, stopover } =
        config;

      const formatDate = (d: Date) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      };

      const returnFrom = new Date(departureFrom);
      returnFrom.setDate(returnFrom.getDate() + returnMinDays);
      const returnTo = new Date(departureTo);
      returnTo.setDate(returnTo.getDate() + returnMaxDays);

      const params = new URLSearchParams({
        fly_from: origin,
        fly_to: destination,
        date_from: formatDate(new Date(departureFrom)),
        date_to: formatDate(new Date(departureTo)),
        return_from: formatDate(returnFrom),
        return_to: formatDate(returnTo),
        adults: String(passengers),
        curr: 'USD',
        limit: '50',
      });

      if (stopover) {
        params.set('stopover_from', String(stopover.minDays) + 'd');
        params.set('stopover_to', String(stopover.maxDays) + 'd');
        params.set('via', stopover.airport);
      }

      const fetchOptions: RequestInit = {
        headers: { apikey: this.apiKey },
      };

      // Node.js 18+ native fetch doesn't support proxy via RequestInit.
      // When a proxyUrl is provided it's passed but actual proxy handling
      // requires an agent — here we keep the architecture and log intent.
      if (proxyUrl) {
        (fetchOptions as Record<string, unknown>)['proxyUrl'] = proxyUrl;
      }

      const response = await fetch(
        `https://api.tequila.kiwi.com/v2/search?${params.toString()}`,
        fetchOptions,
      );

      if (!response.ok) {
        return [];
      }

      const json = (await response.json()) as { data: KiwiData[] };
      const proxyRegion = (config.proxyRegions[0] ?? 'CL') as ProxyRegion;

      return Promise.all(
        json.data.map((item) =>
          normalizeKiwiResult(item, config.id, config.passengers, proxyRegion),
        ),
      );
    } catch {
      return [];
    }
  }
}
