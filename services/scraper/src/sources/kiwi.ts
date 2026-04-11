import type { FlightResult, SearchConfig } from '@flight-hunter/shared';
import type { FlightSource } from './base-source.js';

export class KiwiSource implements FlightSource {
  readonly name = 'kiwi';

  constructor(private readonly apiKey: string) {}

  async search(_config: SearchConfig, _proxyUrl: string | null): Promise<FlightResult[]> {
    console.warn(`${this.name}: full-roundtrip search is not yet adapted to the waypoint model — returning []`);
    return [];
  }
}
