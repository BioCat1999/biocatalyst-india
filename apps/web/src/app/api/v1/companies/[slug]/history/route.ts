import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getCompanyMarketContext } from "@biocatalyst/data";
import { YahooFinanceProvider } from "@biocatalyst/market-data";
import { slugSchema } from "@/lib/validate";

const ALLOWED_DAYS = new Set([30, 90, 180, 365]);

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const getCachedHistory = unstable_cache(
  async (slug: string, days: number) => {
    const from = daysAgo(days);
    const to = daysAgo(0);
    const context = await getCompanyMarketContext(
      slug,
      from,
      `${to}T23:59:59.999Z`,
    );
    if (!context) return null;

    const provider = new YahooFinanceProvider();
    const bars = await provider.getPrices(
      { ticker: context.ticker, exchange: context.exchange },
      from,
      to,
    );
    return {
      ticker: context.ticker,
      exchange: context.exchange,
      currency: context.currency,
      delayed: true,
      provider: provider.providerName,
      bars,
      events: context.events.map((event) => ({
        id: event.id,
        date: event.occurredAt.slice(0, 10),
        eventType: event.eventType,
        headline: event.headline,
      })),
    };
  },
  ["company-market-history-v2"],
  { revalidate: 900 },
);

/** GET /v1/companies/{slug}/history?days=180 — delayed daily bars plus catalyst markers. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slugSchema.safeParse(slug).success) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  const requested = Number(req.nextUrl.searchParams.get("days") ?? 180);
  const days = ALLOWED_DAYS.has(requested) ? requested : 180;
  const history = await getCachedHistory(slug, days);
  if (!history) {
    return NextResponse.json(
      { error: "company or listed security not found" },
      { status: 404 },
    );
  }
  return NextResponse.json(history, {
    headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
  });
}
