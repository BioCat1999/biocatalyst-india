"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { eventTypeLabel, type EventType } from "@biocatalyst/types";

interface Insights {
  generatedAt: string;
  activity: Array<{ eventType: EventType; count: number }>;
  pipeline: Array<{ phase: string; count: number }>;
  patentCliff: Array<{ year: number; count: number }>;
  regulatorySignals: { approvals: number; safety: number; manufacturing: number; shortages: number };
  upcoming: Array<{
    kind: "trial" | "patent";
    date: string;
    title: string;
    detail: string;
    company: { slug: string; canonicalName: string } | null;
  }>;
}

const PHASE_COLORS = ["#0e7c7b", "#16395c", "#ba7a08", "#1c7a3d", "#b3261e", "#66788a"];

function DashboardSkeleton() {
  return (
    <div className="insights-grid" aria-label="Building intelligence dashboard" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="insight-panel" key={index}>
          <div className="skeleton skeleton-name" />
          <div className="skeleton skeleton-chart" />
        </div>
      ))}
    </div>
  );
}

export function InsightsDashboard() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/insights", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Insights unavailable");
        return response.json() as Promise<Insights>;
      })
      .then(setData)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <div className="empty">
        <p>The intelligence dashboard is temporarily unavailable.</p>
        <button type="button" onClick={() => location.reload()}>Try again</button>
      </div>
    );
  }

  return (
    <>
      <section className="insights-hero">
        <div>
          <span className="insights-eyebrow">BIOPHARMA SIGNAL MAP</span>
          <h1>What is moving, what is coming next</h1>
          <p>A six-month view across catalysts, regulation, trials and patent cliffs.</p>
        </div>
        {data && (
          <span className="insights-updated">
            Updated {new Date(data.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        )}
      </section>

      {!data ? <DashboardSkeleton /> : <Dashboard data={data} />}
    </>
  );
}

function Dashboard({ data }: { data: Insights }) {
  const topActivity = data.activity.slice(0, 7);
  const maxActivity = Math.max(...topActivity.map((item) => item.count), 1);
  const pipeline = data.pipeline.filter((item) => item.count > 0);
  const pipelineTotal = pipeline.reduce((sum, item) => sum + item.count, 0);
  const maxPatents = Math.max(...data.patentCliff.map((item) => item.count), 1);
  const signals = [
    ["Approvals", data.regulatorySignals.approvals, "positive"],
    ["Safety", data.regulatorySignals.safety, "negative"],
    ["Manufacturing", data.regulatorySignals.manufacturing, "warning"],
    ["Shortages", data.regulatorySignals.shortages, "teal"],
  ] as const;

  return (
    <div className="insights-grid">
      <section className="insight-panel insight-panel-wide">
        <div className="insight-heading">
          <div><span>REGULATORY PULSE</span><h2>Six-month signal count</h2></div>
          <span className="insight-context">Published events</span>
        </div>
        <div className="signal-grid">
          {signals.map(([label, value, tone]) => (
            <div className={`signal-card signal-${tone}`} key={label}>
              <strong>{value}</strong><span>{label}</span><small>past 180 days</small>
            </div>
          ))}
        </div>
      </section>

      <section className="insight-panel">
        <div className="insight-heading"><div><span>CATALYST ACTIVITY</span><h2>Where activity is concentrated</h2></div></div>
        <div className="activity-chart">
          {topActivity.map((item) => (
            <div className="activity-row" key={item.eventType}>
              <div><span>{eventTypeLabel(item.eventType)}</span><strong>{item.count}</strong></div>
              <div className="bar-track"><span style={{ width: `${Math.max(item.count / maxActivity * 100, 3)}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="insight-panel">
        <div className="insight-heading"><div><span>TRIAL PIPELINE</span><h2>{pipelineTotal} tracked studies</h2></div></div>
        <div className="pipeline-band" aria-label={`Trial pipeline with ${pipelineTotal} trials`}>
          {pipeline.map((item, index) => (
            <span key={item.phase} style={{ flex: item.count, background: PHASE_COLORS[index % PHASE_COLORS.length] }} />
          ))}
        </div>
        <div className="chart-legend">
          {pipeline.map((item, index) => (
            <span key={item.phase}><i style={{ background: PHASE_COLORS[index % PHASE_COLORS.length] }} />{item.phase} · {item.count}</span>
          ))}
        </div>
      </section>

      <section className="insight-panel insight-panel-wide">
        <div className="insight-heading">
          <div><span>PATENT CLIFF</span><h2>Upcoming Orange Book expiries</h2></div>
          <Link href="/patents">Explore patents →</Link>
        </div>
        <div className="patent-chart" aria-label="Upcoming patent expiries by year">
          {data.patentCliff.map((item) => (
            <div className="patent-column" key={item.year}>
              <strong>{item.count}</strong>
              <div><span style={{ height: `${Math.max(item.count / maxPatents * 100, 6)}%` }} /></div>
              <small>{item.year}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="insight-panel insight-panel-wide">
        <div className="insight-heading"><div><span>FORWARD CALENDAR</span><h2>Upcoming milestones</h2></div></div>
        {data.upcoming.length === 0 ? <p className="muted">No dated milestones in the next 18 months.</p> : (
          <ol className="milestone-list">
            {data.upcoming.map((item, i) => (
              <li className={`milestone milestone-${item.kind}`} key={`${item.kind}-${item.date}-${item.title}-${i}`}>
                <time>{new Date(`${item.date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time>
                <div>
                  <span>{item.kind}</span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                  {item.company && <Link href={`/companies/${item.company.slug}`}>{item.company.canonicalName} →</Link>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="insights-footnote">Research intelligence only · verify milestones with the linked primary source.</p>
    </div>
  );
}
