# Architecture (Milestone 0/1)

```
biocatalyst-india/
├── apps/web/            # Next.js 15 + TypeScript PWA (App Router)
│   └── src/app/
│       ├── page.tsx                 # Home / Catalyst Feed (+ filters)
│       ├── events/[id]/            # Event detail
│       ├── companies/[slug]/       # Company page
│       ├── drugs/[slug]/           # Drug page
│       ├── trials/[registry]/[trialId]/  # Trial page
│       ├── search/                  # Universal search
│       ├── watchlist/               # Watchlist UI (localStorage mock)
│       └── api/v1/...               # Typed API (spec §12 subset)
├── packages/types/      # Canonical TS types (mirrors spec §5 tables)
├── packages/data/       # Seed fixtures + data-access functions
├── docs/                # decisions, architecture, data-sources, runbook
└── scripts/             # generate-icons.mjs (PWA icons)
```

## Data flow (M1)

Seeded fixtures (`packages/data/src/seed.ts`) → data-access functions
(`packages/data/src/index.ts`) → consumed directly by React Server
Components AND by Next.js Route Handlers under `/api/v1`. One source of
truth; the API contract (cursor pagination, ISO 8601 timestamps, stable IDs)
matches spec §12 so Milestone 2 can swap the function bodies for Postgres
queries without touching callers.

## What M1 deliberately omits

- No database (fixtures only) — M2.
- No ingestion adapters / AI extraction — M3/M4.
- No live market-data provider — M5 (fixture `MarketDataProvider` only; a
  licensed provider can implement the same interface later).
- No auth; watchlist is a localStorage mock — M6.
- No admin/review console — M3+ (needed once real ingestion exists).

## Key invariants

1. Every surfaced fact carries source URL + source timestamp (fixtures marked).
2. No buy/sell/hold language anywhere; catalyst summaries are operational, not predictive.
3. Unknown fields stay `undefined`/null — never fabricated.
4. Market reaction always shows its measurement window + provider, with
   "around the event" (non-causal) language.

## Data flow (M4) — ingestion + AI extraction

```
fetch → raw snapshot dedupe → normalize → entity resolution
      → event fingerprint dedupe → EXTRACTION → store + index → publish
```

`@biocatalyst/extraction` (new package) implements spec §8 behind the
`ExtractionProvider` interface (`extract(document)`):

- **§8.2 schema** as Zod-validated types (`schema.ts`): closed-taxonomy
  `event_type`, company/drug/trial/indication names, `ticker_candidates`,
  `phase`, `outcome` (`primary_endpoint_met | primary_endpoint_missed |
  unknown`), `facts[]` (`{claim, source_span, confidence}`),
  `published_at`, `confidence`. Invalid payloads are rejected.
- **Providers** (`providers/`): `DeterministicExtractor` (default —
  rule/template extraction, offline) and `MockModelProvider` (canned
  outputs; `MODEL_PROVIDER=mock`). No real model API is wired
  (rationale in `docs/decisions.md`).
- **Guardrails** (spec §8.3): never invent numerics, trial IDs, endpoints,
  dates, or relationships (missing → null/empty); ambiguous outcome →
  `unknown` + lowered confidence; every fact has a verbatim `source_span`;
  endpoint claims below 0.85 confidence → `pending_review`.
- **Caching** (spec §8.1): `extractions` table keyed on
  `(document_hash, provider, prompt_version, schema_version)` — the same
  document is never re-extracted unless the prompt/schema version changes.
- **Fallback** (spec §17): provider errors or invalid JSON resolve to the
  deterministic extractor, confidence capped at 0.5, `fallback_used=true`,
  `review_status='pending_review'` — the pipeline never crashes.
- **Summaries**: `factual_summary` (80–150 words) and `catalyst_summary`
  (neutral operational relevance, no investment language — spec §6) are
  generated from structured facts via deterministic templates.
- **Review queue**: `listPendingReview` (data layer) + `reviewQueue` in
  `GET /api/v1/admin/health` and `GET /api/v1/admin/review-queue`.

The ingestion runner (`runIngestion`) calls `extractDocument` per candidate
after entity resolution, stores the extraction, and writes the event with
the extraction's summaries, effective confidence, review status, and
`extraction_id` link (migration `004_extraction.sql`). M3 dedupe and
provenance behavior is unchanged.

## What M4 deliberately omits

- No real/hosted model API (offline-first; see decisions).
- No review UI — the queue is queryable via admin API only (M6+).
