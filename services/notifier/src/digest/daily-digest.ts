import type { PrismaClient } from '@flight-hunter/shared/db';
import type { EmailChannel } from '../channels/email.js';
import { formatDigest, formatDigestDate, type DigestSearch } from '../formatter/digest-fmt.js';

export interface DailyDigestOptions {
  prisma: PrismaClient;
  email: EmailChannel;
}

export class DailyDigest {
  constructor(private readonly opts: DailyDigestOptions) {}

  async run(): Promise<void> {
    const { prisma, email } = this.opts;
    const now = new Date();

    // Get all active searches with digest enabled
    const searches = await (prisma.search.findMany as any)({
      where: {
        status: 'active',
        digestEnabled: true,
      },
      include: {
        flightResults: {
          where: { suspicious: false },
          orderBy: { pricePerPerson: 'asc' },
          take: 10,
        },
      },
    });

    if (searches.length === 0) return;

    const digestSearches: DigestSearch[] = [];

    for (const search of searches) {
      // Check frequency: respect digestFrequency
      if (!this.shouldSendDigest(search, now)) continue;

      const results: any[] = search.flightResults ?? [];
      if (results.length === 0) continue;

      // Calculate min price change since last digest
      let minPriceChange: number | undefined;
      if (search.lastDigestSentAt) {
        const recentMin = results.length > 0 ? Number(results[0].pricePerPerson) : null;
        const previousMin = await this.getMinPriceAtDate(
          prisma,
          search.id,
          search.lastDigestSentAt,
        );
        if (recentMin !== null && previousMin !== null) {
          const change = recentMin - previousMin;
          // Only include in digest if something changed (or no previous digest)
          minPriceChange = change;
          if (change === 0) continue; // skip if no change
        }
      }

      const top3 = results.slice(0, 3).map((r: any) => {
        const outbound = r.outbound as any;
        const inbound = r.inbound as any;
        return {
          price: Number(r.pricePerPerson),
          currency: r.currency,
          airline: outbound?.airline ?? '—',
          departureDate: outbound?.departure?.time?.slice(0, 10) ?? '—',
          returnDate: inbound?.arrival?.time?.slice(0, 10) ?? '—',
          bookingUrl: r.bookingUrl,
        };
      });

      digestSearches.push({
        id: search.id,
        name: search.name,
        origin: search.origin,
        destination: search.destination,
        minPriceChange,
        top3,
      });
    }

    if (digestSearches.length === 0) return;

    const { subject, html } = formatDigest({
      date: formatDigestDate(now),
      searches: digestSearches,
    });

    await email.send(subject, html);

    // Update lastDigestSentAt for all included searches
    const ids = digestSearches.map((s) => s.id);
    await (prisma.search.updateMany as any)({
      where: { id: { in: ids } },
      data: { lastDigestSentAt: now },
    });
  }

  private shouldSendDigest(search: any, now: Date): boolean {
    const freq = search.digestFrequency ?? 'daily';
    if (freq === 'off') return false;
    if (!search.lastDigestSentAt) return true;

    const last = new Date(search.lastDigestSentAt);
    const diffMs = now.getTime() - last.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);

    if (freq === 'daily') return diffDays >= 1;
    if (freq === 'every2days') return diffDays >= 2;
    if (freq === 'weekly') return diffDays >= 7;

    return true;
  }

  private async getMinPriceAtDate(
    prisma: PrismaClient,
    searchId: string,
    date: Date,
  ): Promise<number | null> {
    const cutoff = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    const agg = await prisma.flightResult.aggregate({
      where: {
        searchId,
        scrapedAt: { gte: cutoff, lte: date },
        suspicious: false,
      },
      _min: { pricePerPerson: true },
    });
    return agg._min.pricePerPerson !== null ? Number(agg._min.pricePerPerson) : null;
  }
}
