import type { FlightResult, SearchConfig, ProxyRegion } from '@flight-hunter/shared';
import { getRuntimeConfig } from '@flight-hunter/shared';
type LegInput = { origin: string; destination: string; departureFrom: Date; departureTo: Date };

function formatDate(d: Date): string {
  // Use UTC components so the URL date matches the date we store via
  // toISOString() (which is also UTC). Mixing local + UTC was causing
  // off-by-one-day mismatches between what the user saw on Google Flights
  // and the date the dashboard rendered.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// T6: computeDurationMinutes REMOVED — was computing from wall-clock timestamps
// in different timezones (BUE=UTC-3, CUZ=UTC-5) giving inflated durations.
// Now we only use `scrapedDuration` (from "X hr Y min" text) or 0.

export class GoogleFlightsSource {
  readonly name = 'google-flights';

  private async scrapePage(
    page: import('playwright').Page,
    url: string,
  ): Promise<{
    flights: Array<{
      price: number;
      airline: string;
      stops: string;
      departureTime?: string;
      arrivalTime?: string;
      nextDay?: boolean;
      scrapedDuration?: number;
    }>;
    pageUrl: string;
  }> {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

    const proceed = page.getByText('Proceed anyway');
    if (await proceed.isVisible({ timeout: 2000 }).catch(() => false)) {
      await proceed.click();
      await page.waitForLoadState('networkidle', { timeout: 30000 });
    }

    await page.waitForTimeout(4000);

    // T7: Click "Cheapest" tab — Google Flights defaults to "Best" which
    // shows higher-priced "best value" results. We want strictly cheapest.
    // The tab text is "Cheapest from $XXX" so we match partial text.
    try {
      // Try multiple selectors — Google's DOM varies
      const selectors = [
        'button:has-text("Cheapest")',
        '[role="tab"]:has-text("Cheapest")',
        'text=Cheapest',
      ];
      let clicked = false;
      for (const sel of selectors) {
        const tab = page.locator(sel).first();
        if (await tab.isVisible({ timeout: 1500 }).catch(() => false)) {
          await tab.click();
          clicked = true;
          break;
        }
      }
      if (clicked) {
        // Wait for the results to refresh after tab switch
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(3000);
      }
    } catch {
      // Tab not found or click failed — continue with whatever tab is active
    }

    // Capture the actual page URL AFTER clicking Cheapest — it changes to
    // a ?tfs= format that opens the exact same view when the user clicks it.
    const pageUrl = page.url();

    /* v8 ignore start */
    const flights = await page.evaluate(() => {
      // tsx/esbuild injects __name(fn, "name") helper calls around any nested
      // function declaration or arrow assigned to a const, to preserve .name
      // properties. The helper lives in the outer module scope and is NOT
      // serialized into the browser context. We install no-ops via bracket
      // access on globalThis BEFORE any nested function gets declared. We must
      // not assign a const arrow here either (that would trigger __name on
      // itself). Anonymous function expressions assigned via bracket access
      // don't get wrapped because there's no binding name to preserve.
      (globalThis as Record<string, unknown>)['__name'] = function (x: unknown) { return x; };
      (globalThis as Record<string, unknown>)['__name2'] = (globalThis as Record<string, unknown>)['__name'];
      (globalThis as Record<string, unknown>)['__name3'] = (globalThis as Record<string, unknown>)['__name'];
      (globalThis as Record<string, unknown>)['__name4'] = (globalThis as Record<string, unknown>)['__name'];
      (globalThis as Record<string, unknown>)['__name5'] = (globalThis as Record<string, unknown>)['__name'];
      const items: Array<{
        price: number;
        airline: string;
        stops: string;
        departureTime?: string;
        arrivalTime?: string;
        nextDay?: boolean;
      }> = [];
      const body = document.body.innerText;
      const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);

      // Google Flights renders flight times in two layouts:
      //   (a) single line: "8:40 AM – 5:20 PM" or "5:10 PM – 1:00 AM+1"
      //   (b) three lines: "8:40 AM" / "–" / "5:20 PM" (this is what the
      //       innerText of the live listing actually produces)
      // We try (a) first as a fallback and otherwise look for two TIME_ONLY
      // lines back-to-back (separated by an optional dash line).
      const TIME_RANGE = /^(\d{1,2}:\d{2}\s*[AP]M)\s*[–—-]\s*(\d{1,2}:\d{2}\s*[AP]M)(\+\d+)?$/;
      const TIME_ONLY = /^(\d{1,2}:\d{2}\s*[AP]M)(\+\d+)?$/i;
      const DASH_ONLY = /^[–—-]$/;

      function findTimeRange(idxStart: number, idxEnd: number): {
        departureTime: string;
        arrivalTime: string;
        nextDay: boolean;
      } | undefined {
        const step = idxEnd >= idxStart ? 1 : -1;
        for (let j = idxStart; step > 0 ? j <= idxEnd : j >= idxEnd; j += step) {
          const line = lines[j];
          if (!line) continue;
          // (a) Single-line range
          const single = line.match(TIME_RANGE);
          if (single) {
            return {
              departureTime: single[1].replace(/\s+/g, ' ').trim(),
              arrivalTime: single[2].replace(/\s+/g, ' ').trim(),
              nextDay: !!single[3],
            };
          }
          // (b) Multi-line: a TIME_ONLY here, optional dash next, then another TIME_ONLY
          const first = line.match(TIME_ONLY);
          if (first) {
            // Look for the second time within the next few lines
            for (let k = j + 1; k <= Math.min(lines.length - 1, j + 4); k++) {
              const candidate = lines[k];
              if (!candidate) continue;
              if (DASH_ONLY.test(candidate)) continue; // skip dash separator
              const second = candidate.match(TIME_ONLY);
              if (second) {
                return {
                  departureTime: first[1].replace(/\s+/g, ' ').trim(),
                  arrivalTime: second[1].replace(/\s+/g, ' ').trim(),
                  nextDay: !!first[2] || !!second[2],
                };
              }
              // If we hit something that isn't a dash and isn't a time, abort
              // to avoid misreading unrelated lines.
              break;
            }
          }
        }
        return undefined;
      }

      // Match total flight duration "9 hr 45 min" but NOT layover duration
      // "3 hr 51 min SCL" (which has an airport code after it).
      // The $ anchor ensures no trailing text like airport names.
      const DURATION_RE = /^(\d{1,2})\s*hr(?:\s+(\d{1,2})\s*min)?$/i;
      const DURATION_MIN_ONLY = /^(\d{1,3})\s*min$/i;

      function parseDurationText(text: string): number | undefined {
        const full = text.match(DURATION_RE);
        if (full) {
          return parseInt(full[1], 10) * 60 + (full[2] ? parseInt(full[2], 10) : 0);
        }
        const minOnly = text.match(DURATION_MIN_ONLY);
        if (minOnly) return parseInt(minOnly[1], 10);
        return undefined;
      }

      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\$(\d{1,3}(?:,\d{3})*)$/);
        if (!m) continue;
        const price = parseInt(m[1].replace(',', ''), 10);
        if (price < 50 || price > 20000) continue;

        let airline = '';
        let stops = '';
        let scrapedDuration: number | undefined;
        // Look BACKWARD first — the listing usually has [time/airline/stops/duration] before $price
        const lookbackEnd = Math.max(0, i - 25);
        const lookaheadEnd = Math.min(lines.length - 1, i + 10);

        for (let j = i - 1; j >= lookbackEnd; j--) {
          const prev = lines[j];
          if (!airline && /LATAM|Aerol|Avianca|Copa|JetSMART|Sky|GOL|Azul|American|Delta|United|Iberia|Air France|KLM|Lufthansa/i.test(prev)) {
            airline = prev.split('Operated')[0].trim();
          }
          if (!stops && /^\d+ stop|^Nonstop$/i.test(prev)) {
            stops = prev;
          }
          if (scrapedDuration === undefined) {
            const dur = parseDurationText(prev);
            if (dur !== undefined && dur >= 30 && dur <= 2880) scrapedDuration = dur;
          }
          if (airline && stops && scrapedDuration !== undefined) break;
        }

        // Find time range — backward first, then forward
        const back = findTimeRange(i - 1, lookbackEnd);
        const range = back ?? findTimeRange(i + 1, lookaheadEnd);

        items.push({
          price,
          airline,
          stops,
          departureTime: range?.departureTime,
          arrivalTime: range?.arrivalTime,
          nextDay: range?.nextDay,
          scrapedDuration,
        });
      }

      const seen = new Set<string>();
      return items.filter((f) => {
        const k = `${f.price}-${f.airline}-${f.departureTime ?? ''}-${f.scrapedDuration ?? ''}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    });
    /* v8 ignore stop */

    return { flights, pageUrl };
  }

  /**
   * Convert a "8:40 AM" + base date into an ISO timestamp.
   * Returns the base date at midnight UTC if the time string is missing or unparseable.
   */
  private timeStringToIso(baseDate: Date, timeStr: string | undefined, addDays = 0): string {
    if (!timeStr) {
      const d = new Date(baseDate);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString();
    }
    const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    /* v8 ignore next 5 */
    if (!m) {
      const d = new Date(baseDate);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString();
    }
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    // We don't know the airline's timezone reliably, so we encode the wall clock time
    // as if it were UTC. The dashboard will render it as-is to the user (in their TZ),
    // which gives the right "looks like the schedule on Google Flights" experience.
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() + addDays);
    d.setUTCHours(hour, minute, 0, 0);
    return d.toISOString();
  }

  /** URL for SCRAPING — always 1 adult for consistent per-person pricing. */
  buildScrapeUrl(origin: string, destination: string, depDate: Date): string {
    return `https://www.google.com/travel/flights?q=One+way+flight+from+${origin}+to+${destination}+on+${formatDate(depDate)}&curr=USD&hl=en`;
  }

  /** URL shown to the USER in alerts — includes the real passenger count. */
  buildBookingUrl(origin: string, destination: string, depDate: Date, passengers: number): string {
    const paxStr = passengers > 1 ? `+for+${passengers}+adults` : '';
    return `https://www.google.com/travel/flights?q=One+way+flight+from+${origin}+to+${destination}+on+${formatDate(depDate)}${paxStr}&curr=USD&hl=en`;
  }

  /**
   * Generates departure dates for a leg, capped at scraperMaxDatesPerPair
   * (runtime-configurable; default 8) to avoid abuse.
   */
  private buildLegDates(leg: LegInput): Date[] {
    const dates: Date[] = [];
    const cursor = new Date(leg.departureFrom);
    const depTo = new Date(leg.departureTo);
    const maxDates = getRuntimeConfig().scraperMaxDatesPerPair;
    while (cursor.getTime() <= depTo.getTime() && dates.length < maxDates) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }


  async searchOneWay(
    config: SearchConfig,
    leg: LegInput & { passengers?: number },
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
      console.log(`    Google Flights one-way (${leg.origin}→${leg.destination}): scraping ${dates.length} date(s)`);

      const allResults: FlightResult[] = [];

      for (const dep of dates) {
        const legPax = leg.passengers ?? config.passengers;
        // Scrape with ACTUAL passenger count so the results match what the
        // user sees when they click the booking link. Google always shows
        // TOTAL price for N adults → we divide by N to get per-person.
        const url = this.buildBookingUrl(leg.origin, leg.destination, dep, legPax);
        try {
          const { flights, pageUrl } = await this.scrapePage(page, url);
          // pageUrl is the actual URL after clicking "Cheapest" tab — may differ
          // from the constructed URL. This is what the user should click.
          const bookingUrl = pageUrl || url;
          console.log(`      ${formatDate(dep)}: ${flights.length} flight(s)`);

          for (const f of flights) {
            const stopCount = /nonstop/i.test(f.stops) ? 0 : parseInt(f.stops, 10) || 1;
            const depIso = this.timeStringToIso(dep, f.departureTime, 0);
            const arrIso = this.timeStringToIso(dep, f.arrivalTime, f.nextDay ? 1 : 0);
            // T6: Only use duration from scraped text ("8 hr 48 min").
            // Never compute from timestamps — they're wall-clock in different
            // timezones so the diff is wrong for cross-timezone flights.
            const durationMinutes = f.scrapedDuration ?? 0;
            allResults.push({
              searchId: config.id,
              source: 'google-flights' as const,
              outbound: {
                departure: { airport: leg.origin, time: depIso },
                arrival: { airport: leg.destination, time: arrIso },
                airline: f.airline || 'Unknown',
                flightNumber: 'N/A',
                durationMinutes,
                stops: stopCount,
              },
              inbound: {
                departure: { airport: leg.destination, time: arrIso },
                arrival: { airport: leg.origin, time: arrIso },
                airline: f.airline || 'Unknown',
                flightNumber: 'N/A',
                durationMinutes,
                stops: stopCount,
              },
              totalPrice: f.price,
              currency: 'USD',
              // Google shows TOTAL for N adults. Divide by N for per-person.
              pricePer: 'total' as const,
              passengers: legPax,
              bookingUrl,
              carryOnIncluded: true,
              scrapedAt: new Date(),
              proxyRegion,
            });
          }
        } catch (err) {
          console.error(`      ${formatDate(dep)} failed:`, err instanceof Error ? err.message : err);
        }
      }

      await browser.close();
      console.log(`    Google Flights one-way (${leg.origin}→${leg.destination}): total ${allResults.length} result(s)`);
      return allResults;
    } catch (err) {
      console.error(`    Google Flights one-way error:`, err instanceof Error ? err.message : err);
      return [];
    } finally {
      await browser?.close().catch(() => {});
    }
  }
}
