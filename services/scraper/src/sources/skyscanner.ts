import type { FlightResult, SearchConfig } from '@flight-hunter/shared';
import type { FlightSource } from './base-source.js';

export class SkyscannerSource implements FlightSource {
  readonly name = 'skyscanner';

  constructor(private readonly rapidApiKey: string) {}

  async search(_config: SearchConfig, _proxyUrl: string | null): Promise<FlightResult[]> {
    console.warn(`${this.name}: full-roundtrip search is not yet adapted to the waypoint model — returning []`);
    return [];
  }
}
