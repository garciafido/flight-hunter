/* v8 ignore file */
import type { FlightResult, SearchConfig } from '@flight-hunter/shared';

export interface FlightSource {
  name: string;
  search(config: SearchConfig, proxyUrl: string | null): Promise<FlightResult[]>;
}
