import { NextRequest, NextResponse } from "next/server";
import { getCompany, listEvents } from "@biocatalyst/data";
import { YahooFinanceProvider } from "@biocatalyst/market-data";
import { slugSchema } from "@/lib/validate";

const ALLOWED_DAYS = new Set([30, 90, 180, 365]);

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** GET /v1/companies/{slug}/history?days=180 — delayed daily bars plus catalyst markers. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slugSchema.safeParse(slug).success) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  const requested = Number(req.nextUrl.searchParams.get("days") ?? 180);
  const days = ALLOWED_DAYS.has(requested) ? requested : 180;
  const company = await getCompany(slug);
  if (!company) return NextResponse.json({ error: "company not found" }, { status: 404 });
  const security = company.securities.find((item) => item.exchange === "NSE") ?? company.securities[0];
  if (!security) return NextResponse.json({ error: "company has no listed security" }, { status: 404 });
  const from = daysAgo(days);
  const to = daysAgo(0);
  const provider = new YahooFinanceProvider();
  const [bars, eventPage] = await Promise.all([
    provider.getPrices({ ticker: security.ticker, exchange: security.exchange }, from, to),
    listEvents({ companyId: company.id, from, to: `${to}T23:59:59.999Z` }, undefined, 40),
  ]);
  return NextResponse.json({
    ticker: security.ticker,
    exchange: security.exchange,
    currency: security.currency,
    delayed: true,
    provider: provider.providerName,
    bars,
    events: eventPage.items.map((event) => ({
      id: event.id,
      date: event.occurredAt.slice(0, 10),
      eventType: event.eventType,
      headline: event.headline,
    })),
  }, {
    headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
  });
}
