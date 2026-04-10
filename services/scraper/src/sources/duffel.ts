import type { FlightResult, SearchConfig, ProxyRegion } from '@flight-hunter/shared';
import type { FlightSource } from './base-source.js';
import { normalizeDuffelResult } from '../normalizer.js';
import type { DuffelOffer } from '../normalizer.js';

const DUFFEL_API_BASE = 'https://api.duffel.com';
const DUFFEL_API_VERSION = 'v1';

export class DuffelSource implements FlightSource {
  readonly name = 'duffel';

  constructor(private readonly apiToken: string) {}

  async search(config: SearchConfig, _proxyUrl: string | null): Promise<FlightResult[]> {
    if (!this.apiToken) return [];

    try {
      const {
        origin,
        destination,
        departureFrom,
        departureTo,
        returnMinDays,
        passengers,
      } = config;

      const formatDate = (d: Date) => d.toISOString().slice(0, 10);

      const departDate = formatDate(new Date(departureFrom));
      const returnDate = (() => {
        const base = new Date(departureTo);
        base.setDate(base.getDate() + returnMinDays);
        return formatDate(base);
      })();

      // Step 1: Create offer request
      const offerRequestBody = {
        data: {
          slices: [
            {
              origin,
              destination,
              departure_date: departDate,
            },
            {
              origin: destination,
              destination: origin,
              departure_date: returnDate,
            },
          ],
          passengers: Array.from({ length: passengers }, () => ({ type: 'adult' })),
          cabin_class: 'economy',
        },
      };

      const offerReqRes = await fetch(
        `${DUFFEL_API_BASE}/air/offer_requests`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Duffel-Version': DUFFEL_API_VERSION,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(offerRequestBody),
        },
      );

      if (!offerReqRes.ok) {
        return [];
      }

      const offerReqJson = (await offerReqRes.json()) as { data: { id: string } };
      const offerRequestId = offerReqJson.data?.id;
      if (!offerRequestId) return [];

      // Step 2: Fetch offers
      const offersRes = await fetch(
        `${DUFFEL_API_BASE}/air/offers?offer_request_id=${offerRequestId}&limit=30`,
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Duffel-Version': DUFFEL_API_VERSION,
            Accept: 'application/json',
          },
        },
      );

      if (!offersRes.ok) {
        return [];
      }

      const offersJson = (await offersRes.json()) as { data: DuffelOffer[] };

      if (!Array.isArray(offersJson.data)) return [];

      const proxyRegion = (config.proxyRegions[0] ?? 'CL') as ProxyRegion;

      return offersJson.data
        .filter((offer) => offer.slices?.length >= 2)
        .map((offer) => normalizeDuffelResult(offer, config.id, passengers, proxyRegion));
    } catch {
      return [];
    }
  }
}
