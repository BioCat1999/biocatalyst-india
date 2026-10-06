import { NextRequest, NextResponse } from "next/server";
import { getCompany } from "@biocatalyst/data";
import { YahooFinanceProvider, type PriceBar } from "@biocatalyst/market-data";
import { slugSchema } from "@/lib/validate";

const LOOKBACK_DAYS = 7;

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * GET /v1/companies/{slug}/quote — latest delayed price for the company's
 * preferred listing (NSE first, then BSE) via Yahoo Finance.
 *
 * Never throws for missing market data: price fields are null and the
 * caller renders a dash. Quotes are delayed (~15 min) and for
 * personal/research use — not investment advice.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slugSchema.safeParse(slug).success) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  const company = await getCompany(slug);
  if (!company) return NextResponse.json({ error: "company not found" }, { status: 404 });
  const security =
    company.securities.find((s) => s.exchange === "NSE") ?? company.securities[0];
  if (!security) {
    return NextResponse.json({ error: "company has no listed security" }, { status: 404 });
  }

  const base = {
    ticker: security.ticker,
    exchange: security.exchange,
    currency: security.currency,
    price: null as number | null,
    previousClose: null as number | null,
    changePct: null as number | null,
    asOf: null as string | null,
    delayed: true,
  };

  try {
    const provider = new YahooFinanceProvider();
    const bars = await provider.getPrices(
      { ticker: security.ticker, exchange: security.exchange },
      isoDaysAgo(LOOKBACK_DAYS),
      isoDaysAgo(0),
    );
    const closes = bars.filter((b: PriceBar) => Number.isFinite(b.close));
    if (closes.length > 0) {
      const latest = closes[closes.length - 1];
      const prev = closes.length > 1 ? closes[closes.length - 2] : null;
      base.price = latest.close;
      base.asOf = latest.date;
      if (prev && prev.close !== 0) {
        base.previousClose = prev.close;
        base.changePct = Math.round(((latest.close - prev.close) / prev.close) * 10000) / 100;
      }
    }
  } catch {
    // Failure discipline: missing market data yields nulls, never a 500.
  }

  return NextResponse.json(base);
}
