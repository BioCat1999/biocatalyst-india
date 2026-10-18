"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { eventTypeLabel, type EventType } from "@biocatalyst/types";

type Range = 30 | 90 | 180 | 365;
interface History {
  ticker: string;
  exchange: string;
  currency: string;
  provider: string;
  bars: Array<{ date: string; close: number; volume?: number }>;
  events: Array<{ id: string; date: string; eventType: EventType; headline: string }>;
}

const RANGES: Array<[string, Range]> = [["1M", 30], ["3M", 90], ["6M", 180], ["1Y", 365]];

export function CompanyMarketChart({ slug }: { slug: string }) {
  const [range, setRange] = useState<Range>(180);
  const [data, setData] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setUnavailable(false);
    fetch(`/api/v1/companies/${encodeURIComponent(slug)}/history?days=${range}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("History unavailable");
        return response.json() as Promise<History>;
      })
      .then((result) => setData(result))
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setUnavailable(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [range, slug]);

  const geometry = useMemo(() => {
    const bars = data?.bars ?? [];
    if (bars.length < 2) return null;
    const width = 760, height = 240, left = 48, right = 12, top = 16, bottom = 205;
    const min = Math.min(...bars.map((bar) => bar.close));
    const max = Math.max(...bars.map((bar) => bar.close));
    const pad = Math.max((max - min) * .12, max * .01, 1);
    const low = min - pad, high = max + pad;
    const x = (index: number) => left + index / (bars.length - 1) * (width - left - right);
    const y = (value: number) => top + (high - value) / (high - low) * (bottom - top);
    const line = bars.map((bar, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(bar.close).toFixed(1)}`).join(" ");
    const events = data!.events.map((event) => {
      const target = Date.parse(`${event.date}T00:00:00Z`);
      let best = 0;
      bars.forEach((bar, index) => {
        if (Math.abs(Date.parse(`${bar.date}T00:00:00Z`) - target) < Math.abs(Date.parse(`${bars[best].date}T00:00:00Z`) - target)) best = index;
      });
      return { ...event, x: x(best), y: y(bars[best].close) };
    });
    return { width, height, left, right, top, bottom, min, max, line, area: `${line} L${x(bars.length - 1)},${bottom} L${x(0)},${bottom} Z`, events };
  }, [data]);

  if (unavailable) return null;
  return (
    <section className="panel market-panel" aria-label="Market intelligence">
      <div className="market-chart-head">
        <div><span className="insights-eyebrow">MARKET INTELLIGENCE</span><h2>Price history + catalysts</h2></div>
        <div className="range-picker" aria-label="Chart range">
          {RANGES.map(([label, value]) => <button type="button" aria-pressed={range === value} onClick={() => setRange(value)} key={value}>{label}</button>)}
        </div>
      </div>
      {loading && !data ? <div className="skeleton skeleton-market" /> : data && geometry && (
        <>
          <div className="market-summary">
            <strong>{data.ticker} · {data.exchange}</strong>
            <span>{data.bars.at(-1)?.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {data.currency}</span>
          </div>
          <svg className="market-chart" viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label={`${data.ticker} price history with catalyst markers`}>
            <defs><linearGradient id={`price-fill-${slug}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0e7c7b" stopOpacity=".28"/><stop offset="1" stopColor="#0e7c7b" stopOpacity=".02"/></linearGradient></defs>
            {[0, .5, 1].map((fraction) => {
              const y = geometry.top + fraction * (geometry.bottom - geometry.top);
              const value = geometry.max - fraction * (geometry.max - geometry.min);
              return <g key={fraction}><line x1={geometry.left} y1={y} x2={geometry.width - geometry.right} y2={y} className="chart-gridline"/><text x="0" y={y + 4} className="chart-axis">{value.toFixed(0)}</text></g>;
            })}
            <path d={geometry.area} fill={`url(#price-fill-${slug})`} />
            <path d={geometry.line} className="price-line" />
            {geometry.events.map((event) => <g key={event.id}><line x1={event.x} y1={geometry.top} x2={event.x} y2={geometry.bottom} className="event-line"/><circle cx={event.x} cy={event.y} r="5" className="event-dot"><title>{event.headline}</title></circle></g>)}
            <text x={geometry.left} y="232" className="chart-axis">{data.bars[0].date.slice(5)}</text>
            <text x={geometry.width - geometry.right} y="232" textAnchor="end" className="chart-axis">{data.bars.at(-1)?.date.slice(5)}</text>
          </svg>
          {data.events.length > 0 && <div className="chart-events">
            {data.events.slice(0, 3).map((event) => <Link href={`/events/${event.id}`} key={event.id}><i /> <span><small>{eventTypeLabel(event.eventType)}</small>{event.headline}</span><time>{event.date.slice(5)}</time></Link>)}
          </div>}
          <p className="chart-source">Delayed daily data · {data.provider} · research use</p>
        </>
      )}
    </section>
  );
}
