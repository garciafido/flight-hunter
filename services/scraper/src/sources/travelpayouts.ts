import type { FlightResult, SearchConfig, ProxyRegion } from '@flight-hunter/shared';
import type { FlightSource } from './base-source.js';
import { normalizeTravelpayoutsResult } from '../normalizer.js';
import type { TravelpayoutsData } from '../normalizer.js';

export class TravelpayoutsSource implements FlightSource {
  readonly name = 'travelpayouts';

  constructor(private readonly token: string) {}

  async search(config: SearchConfig, _proxyUrl: string | null): Promise<FlightResult[]> {
    if (!this.token) return [];

    try {
      const {
        origin,
        destination,
        departureFrom,
        departureTo,
        returnMinDays,
        returnMaxDays,
        passengers,
      } = config;

      const formatDate = (d: Date) => d.toISOString().slice(0, 10);

      const departDate = formatDate(new Date(departureFrom));
      const returnDate = (() => {
        const base = new Date(departureTo);
        base.setDate(base.getDate() + returnMinDays);
        return formatDate(base);
      })();

      const params = new URLSearchParams({
        origin,
        destination,
        depart_date: departDate,
        return_date: returnDate,
        currency: 'usd',
        token: this.token,
        one_way: 'false',
        limit: '30',
      });

      const response = await fetch(
        `https://api.travelpayouts.com/v2/prices/latest?${params.toString()}`,
      );

      if (!response.ok) {
        return [];
      }

      const json = (await response.json()) as { success: boolean; data: TravelpayoutsData[]; currency: string };

      if (!json.success || !Array.isArray(json.data)) {
        return [];
      }

      const proxyRegion = (config.proxyRegions[0] ?? 'CL') as ProxyRegion;

      return json.data.map((item) =>
        normalizeTravelpayoutsResult(item, json.currency, config.id, passengers, proxyRegion),
      );
    } catch {
      return [];
    }
  }
}
