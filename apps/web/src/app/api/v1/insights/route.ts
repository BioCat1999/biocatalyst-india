import { NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";

/** GET /v1/insights — compact aggregates for the mobile intelligence dashboard. */
export async function GET() {
  const pool = getPool();
  const [activity, pipeline, patents, signals, trials, patentDates] = await Promise.all([
    pool.query<{ event_type: string; count: string }>(
      `SELECT event_type, COUNT(*)::text AS count
         FROM events
        WHERE review_status = 'published'
          AND occurred_at >= now() - interval '180 days'
        GROUP BY event_type ORDER BY COUNT(*) DESC, event_type`,
    ),
    pool.query<{ phase: string; count: string }>(
      `SELECT COALESCE(phase, 'Unknown') AS phase, COUNT(*)::text AS count
         FROM trials GROUP BY COALESCE(phase, 'Unknown') ORDER BY COUNT(*) DESC`,
    ),
    pool.query<{ year: string; count: string }>(
      `SELECT EXTRACT(YEAR FROM expiry_date)::int::text AS year, COUNT(*)::text AS count
         FROM patents
        WHERE delisted = false AND expiry_date >= CURRENT_DATE
          AND expiry_date < CURRENT_DATE + interval '6 years'
        GROUP BY EXTRACT(YEAR FROM expiry_date) ORDER BY year`,
    ),
    pool.query<{ approvals: string; safety: string; manufacturing: string; shortages: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'regulatory_approval')::text AS approvals,
         COUNT(*) FILTER (WHERE event_type = 'safety_signal')::text AS safety,
         COUNT(*) FILTER (WHERE event_type = 'manufacturing_or_inspection_update')::text AS manufacturing,
         COUNT(*) FILTER (WHERE event_type = 'drug_shortage')::text AS shortages
       FROM events
       WHERE review_status = 'published' AND occurred_at >= now() - interval '180 days'`,
    ),
    pool.query<{ date: string; title: string; company_slug: string | null; company_name: string | null; detail: string }>(
      `SELECT t.primary_completion_date::text AS date, t.title,
              c.slug AS company_slug, c.canonical_name AS company_name,
              CONCAT(t.phase, ' · ', t.registry_trial_id) AS detail
         FROM trials t
         LEFT JOIN companies c ON c.id = t.sponsor_company_id
        WHERE t.primary_completion_date >= CURRENT_DATE
          AND t.primary_completion_date < CURRENT_DATE + interval '18 months'
        ORDER BY t.primary_completion_date LIMIT 12`,
    ),
    pool.query<{ date: string; title: string; company_slug: string | null; company_name: string | null; detail: string }>(
      `SELECT p.expiry_date::text AS date,
              CONCAT(p.trade_name, ' patent expiry') AS title,
              c.slug AS company_slug, c.canonical_name AS company_name,
              CONCAT('US ', p.patent_number, ' · ', p.active_ingredient) AS detail
         FROM patents p
         LEFT JOIN companies c ON c.id = p.company_id
        WHERE p.delisted = false AND p.expiry_date >= CURRENT_DATE
          AND p.expiry_date < CURRENT_DATE + interval '18 months'
        ORDER BY p.expiry_date LIMIT 12`,
    ),
  ]);

  const upcoming = [
    ...trials.rows.map((row) => ({ ...row, kind: "trial" as const })),
    ...patentDates.rows.map((row) => ({ ...row, kind: "patent" as const })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 16)
    .map((row) => ({
      kind: row.kind,
      date: row.date,
      title: row.title,
      detail: row.detail,
      company: row.company_slug && row.company_name
        ? { slug: row.company_slug, canonicalName: row.company_name }
        : null,
    }));
  const signal = signals.rows[0] ?? { approvals: "0", safety: "0", manufacturing: "0", shortages: "0" };

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    activity: activity.rows.map((row) => ({ eventType: row.event_type, count: Number(row.count) })),
    pipeline: pipeline.rows.map((row) => ({ phase: row.phase, count: Number(row.count) })),
    patentCliff: patents.rows.map((row) => ({ year: Number(row.year), count: Number(row.count) })),
    regulatorySignals: {
      approvals: Number(signal.approvals),
      safety: Number(signal.safety),
      manufacturing: Number(signal.manufacturing),
      shortages: Number(signal.shortages),
    },
    upcoming,
  }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
