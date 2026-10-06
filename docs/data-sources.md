# Data Sources

## M3: live source — `ctri-fixture` (fixture-based CTRI mock)

| Attribute | Value |
|---|---|
| Source name | `ctri-fixture` |
| Models | Clinical Trials Registry – India (CTRI) public records |
| Adapter | `CtriFixtureAdapter` (`packages/ingestion/src/adapters/ctri.ts`) |
| Access pattern | **Fixtures, no network.** Five hand-curated JSON records in `packages/ingestion/src/adapters/fixtures/ctri/*.json` (`CTRI-2023-05-051208.json` … `CTRI-2025-06-088430.json`). All records are **fictional** — CTRI-shaped, not real registry data. |
| Why fixtures | Spec §7: implement an adapter interface and fixture-based mock rather than bypassing access controls where automated access is blocked or terms are unclear. Full rationale in `docs/decisions.md` (2026-10-01 entry). |

### Fields extracted per record

| Fixture field | Maps to | Notes |
|---|---|---|
| Registry/trial ID (e.g. `CTRI/2024/08/071902`) | `trials` row + event fingerprint | Forms the canonical record URL `https://ctri.nic.in/Clinicaltrials/pmaindet2.php?trialid=…` |
| Trial title / public title | event `headline`, `factual_summary` (deterministic template) | No AI generation in M3 |
| Phase (I–IV) | event `phase` | Unknown/unrecognized phases → `null`, never guessed |
| Recruitment/status | event `event_type` (`clinical_trial_started`, `clinical_trial_status_changed`, …) | Unknown statuses → `null` |
| Sponsor name | company linkage (fixture sponsors map to known companies) | Unmatched sponsors create no event |
| `last_updated` (ISO-8601) | `fetchSince` cursor filter; `newest_source_ts` on runs | Cursor is an ISO-8601 timestamp string |
| Source URL | `sources.url`, `canonical_url` | Persisted per spec §7 (URL + content hash + source name) |

### Provenance per ingested event

Every ingested event writes: a `sources` row (`publisher: "Clinical Trials
Registry - India (CTRI)"`, `source_name: "ctri-fixture"`, URL, content
hash, `retrieved_at`), an `event_sources` link (primary), a `raw_snapshots`
archive row, and fingerprint-based dedupe (`events.fingerprint` unique).
Run-level metrics land in `ingestion_runs`; the resume cursor in
`ingestion_cursors`.

### Update cadence

**N/A for fixtures** — the fixture set is static; `pnpm ingest` is
idempotent (content-hash dedupe means re-runs create 0 new events).
A future live CTRI adapter would poll on a documented cadence and the
`ingestion_cursors` table already supports incremental resume.

## M7: live sources — `bse-fixture` and `pubmed-fixture`

Milestone 7 adds two more sources behind the same `SourceAdapter`
interface, run by the same pipeline (extraction → dedupe → merge →
alerts → market reactions). Both are **fixture-based mocks**: five and
three hand-curated JSON records respectively, all fictional, zero network
contact. The registry (`packages/ingestion/src/registry.ts`) runs every
registered adapter in one `pnpm ingest` pass (or one at a time via
`--source <name>`).

### `bse-fixture` (BSE India corporate announcements mock)

| Attribute | Value |
|---|---|
| Source name | `bse-fixture` |
| Models | BSE India exchange corporate announcements (`exchange_announcement` records) |
| Adapter | `BseFixtureAdapter` (`packages/ingestion/src/adapters/bse.ts`) |
| Access pattern | **Fixtures, no network.** Five hand-curated JSON records in `packages/ingestion/src/adapters/fixtures/bse/*.json`, all fictional and marked as such (`_fixture_note` in every record). |
| Why fixtures | Spec §7 / the no-live-network privacy constraint for M7: exchange disclosure feeds need redistribution-terms verification, which is out of scope, so the adapter is a fixture-based mock — same rationale as the CTRI mock (M3, `docs/decisions.md` 2026-10-01). |

#### Fields extracted per record

| Fixture field | Maps to | Notes |
|---|---|---|
| `category` (`regulatory_approval`, `regulatory_submission`, `licensing_or_partnership`, `acquisition_or_divestiture`, `clinical_trial_result`) | event `event_type` | Unmappable categories → `null`, event rejected — never guessed |
| `public_title` | event `headline` | Template-built from company/drug/indication/trial/outcome |
| `company_name` + `ticker_symbol` | company linkage | Canonical `X Ltd` names match seeded companies; unknown tickers match nothing and the candidate is rejected |
| `drug_name`, `indication`, `trial_id` | drug/trial linkage | Trial refs resolved via the same registry resolver as CTRI |
| `primary_outcome_met` (trial results only) | canonical outcome (`primary_endpoint_met` / `primary_endpoint_missed`) | Missing → outcome `null` |
| `partner_company` / `acquired_company` | **text-only mention, never an entity** | Licensing partners and acquisition targets are fictional third parties; they appear in the headline/factual summary but are never linked as `event_entities` (discipline encoded in tests) |
| `announcement_date`/`published_at` (ISO-8601) | `occurred_at`, cursor filter, `newest_source_ts` | Unusable dates → `null`, event rejected |
| `source_url` | `sources.url`, `canonical_url` | Persisted per spec §7 |

### `pubmed-fixture` (PubMed literature mock)

| Attribute | Value |
|---|---|
| Source name | `pubmed-fixture` |
| Models | PubMed abstracts (`scientific_publication` records) |
| Adapter | `PubmedFixtureAdapter` (`packages/ingestion/src/adapters/pubmed.ts`) |
| Access pattern | **Fixtures, no network.** Three hand-curated JSON records in `packages/ingestion/src/adapters/fixtures/pubmed/*.json`, all fictional and marked as such. |
| Why fixtures | Same M7 rationale: no live network contact; the E-utilities API is documented and free, so a future live PubMed adapter is realistic — the fixture adapter already shapes records like E-utilities abstracts. |

#### Fields extracted per record

| Fixture field | Maps to | Notes |
|---|---|---|
| record | event `event_type = scientific_publication` | Always; PubMed is literature, not company announcements |
| `pmid` | canonical record URL `https://pubmed.ncbi.nlm.nih.gov/<pmid>/` | `source_url` may override |
| `abstract_title` | event `headline` | Prefixed with the journal citation |
| `drug_name`, `indication`, `trial_id` (NCT or CTRI IDs) | drug/trial linkage | Outcome stays `null` — abstracts describe publications, not regulatory outcomes |
| `published_date` | `occurred_at`, cursor | Unusable → `null`, rejected |

### Cross-source dedupe (M7, migration `007_cross_source_key.sql`)

The same real-world event can appear in multiple sources (e.g. the
fictional DRL-Denosumab Phase 3 readout is announced on BSE *and*
published as a PubMed abstract). For documents anchored to a resolvable
trial, `crossSourceKey({ registry, registryTrialId })` (sha256 of
`cross-source|REGISTRY|id`, source-agnostic) is stored on
`events.cross_source_key` (partial unique index — `NULL`s exempt).
When a new candidate's key matches an existing event, the pipeline
**merges**: it links the new source + resolved entities into the
existing event (first writer's headline/type/summary stand), counts
`eventsMerged` instead of `eventsCreated`, and raises no new alert.
Trial-anchoring is conservative: it only applies after the ordinary
resolution gate has accepted the candidate, so unresolvable records are
still rejected.

### Provenance per ingested event (all three sources)

Same M3 guarantees: a `sources` row (publisher name, URL, content hash,
`retrieved_at`), an `event_sources` link, a `raw_snapshots` archive row,
run metrics in `ingestion_runs`, resume cursor in `ingestion_cursors`,
plus per-source health via `getSourceHealth` (`GET
/api/v1/admin/health`).

### Update cadence

**N/A for fixtures** — all three fixture sets are static; `pnpm ingest`
is idempotent (re-runs create 0 events, 0 merges). The cursor table
already supports incremental resume for future live adapters.

## Future sources (M8+)

Each follows the M3 pattern: fixtures, tests, health metrics, provenance
(spec M7). Priority order:

| Source | Access pattern (to verify) | Fixture status |
|---|---|---|
| ClinicalTrials.gov | Public API (api.clinicaltrials.gov) | ✅ fixture URLs in seed |
| BSE/NSE corporate announcements | Exchange disclosure feeds; verify redistribution terms | ✅ BSE adapter fixtures added (M7) |
| CDSCO notices | Public notices pages; verify terms | ✅ fixture URLs in seed |
| Company investor-relations pages | Press releases; verify terms | ✅ fixture URLs in seed |
| PubMed | E-utilities API (documented, free) | ✅ PubMed adapter fixtures added (M7) |
| ANVISA / EMA (ex-India regulators) | Public approval databases | ✅ fixture URLs in seed |

## Adapter interface

```ts
interface SourceAdapter {
  sourceName: string;
  fetchSince(cursor: Cursor): Promise<RawSourceDocument[]>;
  normalize(doc: RawSourceDocument): Promise<NormalizedCandidate[]>;
  getNextCursor(): Cursor;
}
```

Rules (spec §7): never bypass auth/CAPTCHA/anti-bot; prefer documented
APIs/RSS/official datasets; persist `retrieved_at`, `published_at`, URL,
content hash, source name; dedupe on canonical URL + content hash +
event fingerprint.

## Market data (M5)

`MarketDataProvider` interface (`packages/market-data`) with a fixture
implementation (`MARKET_DATA_PROVIDER=fixture`, the default — offline
illustrative price series, no API keys). `market_reactions` rows carry the
exact window definition + bounds, provider name, and license/usage metadata;
benchmark-relative change is supported via a synthetic `"NIFTY Pharma
(fixture)"` index where available, otherwise benchmark fields stay null —
never fabricated. `pnpm market:reaction` computes/backfills reactions
idempotently after event publish. Rationale in `docs/decisions.md`.
