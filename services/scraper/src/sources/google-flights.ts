import type { FlightResult, SearchConfig, ProxyRegion, SearchLeg } from '@flight-hunter/shared';
import type { FlightSource } from './base-source.js';

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export class GoogleFlightsSource implements FlightSource {
  readonly name = 'google-flights';

  buildUrl(config: SearchConfig, depDate?: Date, retDate?: Date): string {
    const d = depDate ?? new Date(config.departureFrom);
    const r = retDate ?? (() => {
      const x = new Date(d);
      x.setDate(x.getDate() + config.returnMinDays);
      return x;
    })();
    return `https://www.google.com/travel/flights?q=Flights+to+${config.destination}+from+${config.origin}+on+${formatDate(d)}+through+${formatDate(r)}&curr=USD&hl=en`;
  }

  /**
   * Generates date pairs (departure, return) covering the configured ranges.
   * Caps the number of combinations to avoid hammering Google.
   */
  private buildDatePairs(config: SearchConfig): Array<{ dep: Date; ret: Date }> {
    const pairs: Array<{ dep: Date; ret: Date }> = [];
    const depFrom = new Date(config.departureFrom);
    const depTo = new Date(config.departureTo);

    // Departure dates: every day in the range
    const departures: Date[] = [];
    const cursor = new Date(depFrom);
    while (cursor.getTime() <= depTo.getTime()) {
      departures.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    // Return offsets: sample min, max, and a couple in between
    const offsets = new Set<number>([config.returnMinDays, config.returnMaxDays]);
    const mid = Math.round((config.returnMinDays + config.returnMaxDays) / 2);
    if (mid !== config.returnMinDays && mid !== config.returnMaxDays) offsets.add(mid);

    for (const dep of departures) {
      for (const offset of offsets) {
        const ret = new Date(dep);
        ret.setDate(ret.getDate() + offset);
        pairs.push({ dep, ret });
        // Cap total pairs to avoid abuse
        if (pairs.length >= 12) return pairs;
      }
    }
    return pairs;
  }

  private async scrapePage(
    page: import('playwright').Page,
    url: string,
  ): Promise<Array<{ price: number; airline: string; stops: string }>> {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

    const proceed = page.getByText('Proceed anyway');
    if (await proceed.isVisible({ timeout: 2000 }).catch(() => false)) {
      await proceed.click();
      await page.waitForLoadState('networkidle', { timeout: 30000 });
    }

    await page.waitForTimeout(4000);

    /* v8 ignore start */
    const flights = await page.evaluate(() => {
      const items: Array<{ price: number; airline: string; stops: string }> = [];
      const body = document.body.innerText;
      const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);

      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\$(\d{1,3}(?:,\d{3})*)$/);
        if (!m) continue;
        const price = parseInt(m[1].replace(',', ''), 10);
        if (price < 50 || price > 20000) continue;

        let airline = '';
        let stops = '';
        for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
          const prev = lines[j];
          if (!airline && /LATAM|Aerol|Avianca|Copa|JetSMART|Sky|GOL|Azul|American|Delta|United/i.test(prev)) {
            airline = prev.split('Operated')[0].trim();
          }
          if (!stops && /^\d+ stop|^Nonstop$/i.test(prev)) {
            stops = prev;
          }
        }
        items.push({ price, airline, stops });
      }

      const seen = new Set<string>();
      return items.filter((f) => {
        const k = `${f.price}-${f.airline}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    });
    /* v8 ignore stop */

    return flights;
  }

  buildOneWayUrl(origin: string, destination: string, depDate: Date): string {
    return `https://www.google.com/travel/flights?q=One+way+flight+from+${origin}+to+${destination}+on+${formatDate(depDate)}&curr=USD&hl=en`;
  }

  /**
   * Generates departure dates for a leg, capped at 8 to avoid abuse.
   */
  private buildLegDates(leg: SearchLeg): Date[] {
    const dates: Date[] = [];
    const cursor = new Date(leg.departureFrom);
    const depTo = new Date(leg.departureTo);
    while (cursor.getTime() <= depTo.getTime() && dates.length < 8) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  async searchOneWay(
    config: SearchConfig,
    legIndex: number,
    leg: SearchLeg,
    proxyUrl: string | null,
  ): Promise<FlightResult[]> {
    let browser;
    try {
      const { chromium } = await import('playwright');
      const proxyRegion = (config.proxyRegions[0] ?? 'CL') as ProxyRegion;

      const launchOptions: Parameters<typeof chromium.launch>[0] = { headless: true };
      if (proxyUrl) launchOptions.proxy = { server: proxyUrl };

      browser = await chromium.launch(launchOptions);
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
      });
      const page = await context.newPage();

      const dates = this.buildLegDates(leg);
      console.log(`    Google Flights one-way leg ${legIndex} (${leg.origin}→${leg.destination}): scraping ${dates.length} date(s)`);

      const allResults: FlightResult[] = [];

      for (const dep of dates) {
        const url = this.buildOneWayUrl(leg.origin, leg.destination, dep);
        try {
          const flights = await this.scrapePage(page, url);
          console.log(`      ${formatDate(dep)}: ${flights.length} flight(s)`);

          for (const f of flights) {
            const stopCount = /nonstop/i.test(f.stops) ? 0 : parseInt(f.stops, 10) || 1;
            // For a one-way leg the inbound is a stub pointing back so the type is satisfied
            allResults.push({
              searchId: config.id,
              source: 'google-flights' as const,
              outbound: {
                departure: { airport: leg.origin, time: dep.toISOString() },
                arrival: { airport: leg.destination, time: dep.toISOString() },
                airline: f.airline || 'Unknown',
                flightNumber: 'N/A',
                durationMinutes: 0,
                stops: stopCount,
              },
              inbound: {
                departure: { airport: leg.destination, time: dep.toISOString() },
                arrival: { airport: leg.origin, time: dep.toISOString() },
                airline: f.airline || 'Unknown',
                flightNumber: 'N/A',
                durationMinutes: 0,
                stops: stopCount,
              },
              totalPrice: f.price,
              currency: 'USD',
              pricePer: 'total' as const,
              passengers: config.passengers,
              carryOnIncluded: true,
              bookingUrl: url,
              scrapedAt: new Date(),
              proxyRegion,
              legIndex,
            });
          }
        } catch (err) {
          console.error(`      ${formatDate(dep)} failed:`, err instanceof Error ? err.message : err);
        }
      }

      await browser.close();
      console.log(`    Google Flights one-way leg ${legIndex}: total ${allResults.length} result(s)`);
      return allResults;
    } catch (err) {
      console.error(`    Google Flights one-way error:`, err instanceof Error ? err.message : err);
      return [];
    } finally {
      await browser?.close().catch(() => {});
    }
  }

  async search(config: SearchConfig, proxyUrl: string | null): Promise<FlightResult[]> {
    let browser;
    try {
      const { chromium } = await import('playwright');
      const proxyRegion = (config.proxyRegions[0] ?? 'CL') as ProxyRegion;

      const launchOptions: Parameters<typeof chromium.launch>[0] = { headless: true };
      if (proxyUrl) launchOptions.proxy = { server: proxyUrl };

      browser = await chromium.launch(launchOptions);
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
      });
      const page = await context.newPage();

      const datePairs = this.buildDatePairs(config);
      console.log(`    Google Flights: scraping ${datePairs.length} date combination(s)`);

      const allResults: FlightResult[] = [];

      for (const { dep, ret } of datePairs) {
        const url = this.buildUrl(config, dep, ret);
        try {
          const flights = await this.scrapePage(page, url);
          console.log(`      ${formatDate(dep)} → ${formatDate(ret)}: ${flights.length} flight(s)`);

          for (const f of flights) {
            const stopCount = /nonstop/i.test(f.stops) ? 0 : parseInt(f.stops, 10) || 1;
            allResults.push({
              searchId: config.id,
              source: 'google-flights' as const,
              outbound: {
                departure: { airport: config.origin, time: dep.toISOString() },
                arrival: { airport: config.destination, time: dep.toISOString() },
                airline: f.airline || 'Unknown',
                flightNumber: 'N/A',
                durationMinutes: 0,
                stops: stopCount,
              },
              inbound: {
                departure: { airport: config.destination, time: ret.toISOString() },
                arrival: { airport: config.origin, time: ret.toISOString() },
                airline: f.airline || 'Unknown',
                flightNumber: 'N/A',
                durationMinutes: 0,
                stops: stopCount,
              },
              totalPrice: f.price,
              currency: 'USD',
              pricePer: 'total' as const,
              passengers: config.passengers,
              carryOnIncluded: true,
              bookingUrl: url,
              scrapedAt: new Date(),
              proxyRegion,
            });
          }
        } catch (err) {
          console.error(`      ${formatDate(dep)} → ${formatDate(ret)} failed:`, err instanceof Error ? err.message : err);
        }
      }

      await browser.close();
      console.log(`    Google Flights: total ${allResults.length} result(s)`);
      return allResults;
    } catch (err) {
      console.error(`    Google Flights error:`, err instanceof Error ? err.message : err);
      return [];
    } finally {
      await browser?.close().catch(() => {});
    }
  }
}
