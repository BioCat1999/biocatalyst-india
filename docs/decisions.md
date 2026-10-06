# Architecture Decisions

Decisions taken for Milestone 0/1. New decisions are appended with date + context.

## 2026-09-30 — Monorepo tooling: pnpm + Turborepo
Spec §10 prefers pnpm + Turborepo. Adopted as-is; Turborepo 2.x task graph
(`build` → `test` → `typecheck`) keeps `pnpm test`/`pnpm build` one-command.

## 2026-09-30 — Web: Next.js App Router + TypeScript, no Tailwind
Next.js 15 (App Router) per spec §10. Styling is hand-written CSS
(`apps/web/src/app/globals.css`) instead of Tailwind: for M1's small surface
area it removes a build dependency and gives exact control over the
scientific/financial visual tone (spec §13). Revisit if the design system
grows beyond ~10 components.

## 2026-09-30 — Data layer behind function signatures
`@biocatalyst/data` exposes `listEvents/getEvent/search/...` functions read
from seeded fixtures today. Milestone 2 implements the Postgres schema and
replaces the function bodies with DB queries; signatures stay stable so the
web app and API routes don't change.

## 2026-09-30 — API inside Next.js (no separate FastAPI service)
Spec §10 allows "FastAPI OR Next.js API/worker architecture". Chose Next.js
Route Handlers (`/api/v1/...`) for M1: one deployable, no cross-service auth,
and the data layer is already TypeScript. Revisit in M2 if ingestion becomes
Python-heavy (spec notes Python is preferred then) — the `/v1` contract is
already versioned for that split.

## 2026-09-30 — Validation: TypeScript types only (no Zod yet)
Seed fixtures are compile-time checked via `tsc`. Runtime validation (Zod)
is deferred to M2 when untrusted DB/ingestion input exists.

## 2026-09-30 — Tests: Vitest
Simplest mature option for unit/integration tests in both packages; no
Playwright in M1 (static prototype). Seed-integrity tests encode the M1
acceptance criteria from spec §17.

## 2026-09-30 — PWA: manifest + minimal service worker
`manifest.webmanifest` + tiny `sw.js` (network-first for `/api`, cache-first
for static) satisfies "installable where supported" without a workbox/next-pwa
dependency. Full offline + push deferred to M8/M9.

## 2026-09-30 — Watchlist: localStorage mock
Spec explicitly allows static/mock watchlist UI for M1. Implemented with
localStorage, no auth. Real managed auth (Supabase) + server watchlist +
alerts in M6.

## 2026-09-30 — Seed data is clearly-marked fiction
All 10 companies use real public tickers (stable public facts); drugs with
investigational codes, trials, events, sources and market numbers are
realistic-looking fixtures. Every surface rendering them shows a "Seed
fixture" badge; the fixture header in `seed.ts` states this explicitly.

## 2026-10-01 — Trial URLs: percent-encode the registry ID
CTRI trial IDs contain slashes (`CTRI/2024/08/071902`), so interpolating
them raw into `/trials/[registry]/[trialId]` produced extra path segments
(404). Chose `encodeURIComponent` in a shared `trialUrl()` helper over
renaming the data model: the canonical ID stays human-readable, Next.js
routing matches on the encoded path (no segment split on `%2F`), and the
page/API routes already `decodeURIComponent` before `getTrial()` lookup.

## 2026-10-01 — Telemetry disabled (Next.js + Turborepo)
The `telemetry.vercel.com` calls visible in devtools come from the Next.js
CLI's built-in anonymous usage telemetry — not from any code we wrote (a
repo-wide grep excluding `node_modules` finds zero tracking calls). It is
not required for functioning, so it is disabled project-wide via
`NEXT_TELEMETRY_DISABLED=1` and `TURBO_TELEMETRY_DISABLED=1` in
`.env.example`, plus a local `next telemetry disable` opt-out. The app
itself sends no analytics; any future product analytics (spec §10) will be
an explicit, documented decision — never silent.

## 2026-10-01 — Milestone 2: local Postgres via Ubuntu archives (dev/test)
Spec §10 allows Supabase free tier or equivalent managed Postgres. For
Milestone 2, dev and test run against a **local PostgreSQL installed from
the Ubuntu archives** (`sudo apt install postgresql`) — no Docker (not
available in this environment), no paid services, no new third-party apt
sources. `pnpm db:setup` creates the `biocatalyst` role and the
`biocatalyst_dev` / `biocatalyst_test` databases idempotently. Supabase
free tier remains the production path for Milestone 8; the `DATABASE_URL`
contract is unchanged so the swap is config-only.

## 2026-10-01 — UUID primary keys + legacy_id traceability
Spec §5 says "Prefer UUID primary keys". All tables use UUID PKs
(`gen_random_uuid()`); the Milestone 1 fixture string ids (`co-sun-pharma`,
`evt-...`) are preserved in `legacy_id` columns for traceability. Runtime
code (URLs still use slugs) only sees UUIDs.

## 2026-10-01 — Plain-SQL migrations, no ORM
`packages/db/migrations/*.sql` applied by a ~60-line TS runner
(`schema_migrations` bookkeeping table). Chose this over node-pg-migrate /
Prisma / Drizzle: the schema is fully explicit in SQL, reviewable, and has
zero extra dependencies. Small schema extensions beyond the spec's table
list (documented in `001_init.sql`): `events.indication/phase/outcome`,
`trials.primary_endpoints TEXT[]`, and a `drug_indications` join table —
all required so the @biocatalyst/types contracts map 1:1.

## 2026-10-01 — Data layer: `pg` (node-postgres), same signatures, async
`@biocatalyst/data` keeps every function name/parameter from M1; functions
are now `async` (DB I/O) and callers `await`. New helpers `getCompanyById` /
`getDrugById` / `getTrialById` replace the fixture Maps; the client-side
watchlist resolves names via a new `GET /api/v1/resolve` endpoint. Search
uses Postgres trigram indexes (spec §10: "trigram initially", no
Elasticsearch); cursor pagination preserves M1 semantics (unknown cursor →
first page).

## 2026-10-01 — Zod validation on all API inputs; in-memory rate limiting
Every `/api/v1/*` route validates query/path params with Zod (400 on
invalid, never 500). Rate limiting is a fixed-window per-IP counter
(120 req/min) in `apps/web/src/middleware.ts` — in-memory by design for a
single instance; move to Redis/KV for multi-instance deploys.

## 2026-10-01 — Privacy: no new third-party network contact
Per user direction (2026-09-30): the build introduces no new third-party
network contact — no new apt sources (Ubuntu archives only), no CDNs,
fonts, or external scripts, no telemetry/analytics, no external API calls.
`pg` and `zod` come from the npm registry the project already used; both
are strictly required for functioning (DB client, input validation).
Dependency telemetry stays disabled (see 2026-10-01 telemetry entry).

## 2026-10-01 — M3: fixture-based CTRI adapter (no live fetching yet)

**Decision:** Milestone 3's "one real source" is implemented as a
**fixture-based mock** of a CTRI (Clinical Trials Registry – India)
public-record adapter — `CtriFixtureAdapter`, `sourceName "ctri-fixture"` —
with the full `SourceAdapter` interface, dedupe, provenance, and health
metrics, but **no live HTTP fetching**.

**Why (spec §7 allowance):** The spec's data-source rules state:

- "When a data source blocks automated access or its terms are unclear,
  implement an adapter interface and fixture-based mock **rather than
  bypassing access controls**."
- "Add fixture files for every source adapter so development/tests do not
  depend on live websites."
- Milestone 3 itself is defined as: "Implement one compliant source
  adapter end-to-end, including **fixtures**, dedupe, provenance, and
  event publishing."

CTRI (ctri.nic.in) is a government registry whose terms for automated
scraping are unverified and which may employ anti-bot controls. Scraping it
without documented permission would violate both the spec ("Never bypass
authentication, CAPTCHA, anti-bot controls, or technical access
restrictions") and the guardrails. A live fetch to an undocumented endpoint
is exactly the "bypass" case the spec says to avoid; the sanctioned path is
the fixture-based mock.

**What the mock still proves:** The adapter implements the same interface a
live adapter will (`fetchSince`/`normalize`/`getNextCursor`), runs through
the real pipeline (content-hash + event-fingerprint dedupe, raw-snapshot
archiving, cursor persistence, `ingestion_runs` metrics), and emits real
events with provenance (`sources` rows with publisher "Clinical Trials
Registry - India (CTRI)" and CTRI-style URLs). Fixture records are
hand-curated CTRI-shaped JSON (registry ID, phase, status, sponsor,
`last_updated`) and are **fictional** — clearly badged as fixtures in the
code and docs so nothing can be mistaken for real registry data.

**Path to live:** Swapping in a live CTRI fetch means adding a network
`fetchSince` implementation behind the same interface, gated on documented
permission / a permitted access pattern (official downloadable dataset,
permitted feed). No pipeline, schema, or API changes are needed — the
interface boundary is the seam. Each future source repeats the M3 pattern:
fixtures + tests + health metrics + provenance (spec M7).

**Privacy note:** Zero network requests at runtime, so the no-new-third-party-contact
rule (2026-09-30) is trivially preserved.

## 2026-10-01 — M4: Extraction provider is an interface; no real model API wired

**Decision:** All structured extraction goes through the
`ExtractionProvider` interface (`packages/extraction/src/provider.ts`:
`extract(document): Promise<unknown>`), selected by `MODEL_PROVIDER`
(`deterministic` default, `mock` for tests). The default provider is a
**deterministic rule/template extractor** (regex + record-field rules over
the source text, zero network, zero keys); the mock provider returns canned
structured outputs for exercising model-like behavior (validation,
low-confidence, fallback paths) without any model at all. No real
third-party model API is wired, requested, or required — the build works
fully offline.

**Why no real model (cost, keys, offline-first):**
- *Cost:* spec §8.1 demands model-cost minimization (filter before
  inference, small models, cache by content hash, templates where facts
  suffice). A hosted model API adds per-token cost and billing-surface
  complexity the MVP does not need; the deterministic extractor plus
  template summaries already satisfy "generate headlines and standard card
  text from templates whenever structured facts are sufficient."
- *Keys/secrets:* a real provider would require an API key in env/secrets
  management and a new third-party network contact — both blocked by the
  standing privacy rule (no new third-party contact, no secrets in repo).
  The fixture/mock approach keeps `MODEL_API_KEY` out of `.env.example`
  entirely.
- *Offline-first:* ingestion must run on a laptop with no network (the M3
  fixture adapter already makes zero requests). A hard dependency on a
  hosted model would break `pnpm ingest` offline and make tests flaky.

**Path to a real model:** implement `ExtractionProvider` (e.g. a
`LocalModelProvider` shelling out to an on-device small model — preferred,
keeps everything local — or an HTTP-backed provider), register it in
`selectProvider()`, and bump `PROMPT_VERSION`. No pipeline, schema, cache,
or review-queue changes needed: validation (Zod), content-hash caching,
versioning, confidence rules, and deterministic fallback all sit behind
the interface and apply to any provider. The mock provider's canned
low-confidence/invalid outputs already exercise the guardrail paths a real
model would trigger.

**Guardrail posture (§8.3):** the deterministic extractor may extract or
summarize but never invents numeric values, trial IDs, endpoints, dates, or
company relationships — absent → `null`/`[]`; ambiguous outcome language →
`outcome: "unknown"` with lowered confidence; every fact carries a verbatim
`source_span`. Endpoint claims (`primary_endpoint_met/missed`) below 0.85
confidence go to `pending_review`, never auto-published. Provider
failures/invalid JSON resolve to the deterministic fallback (confidence
capped at 0.5, flagged `pending_review`) — the pipeline never crashes
(spec §17).

## 2026-10-01 — M4: review_status is now extraction-driven (confidence threshold)

**Decision:** Ingested events no longer default to `pending_review`. The
extraction pipeline assigns `review_status` per spec §8.3: confidence ≥
0.85 → `published`; below → `pending_review`; fallback extractions always
`pending_review`. The M3 test asserting "all ingested events are
pending_review" was updated to assert consistency between `events` and
their `extractions` rows instead. Public API behavior is unchanged (the
feed never filtered on `review_status`); the queue is surfaced additively
via `GET /api/v1/admin/health` → `reviewQueue` and
`GET /api/v1/admin/review-queue` (data-layer `listPendingReview`).

## 2026-10-01 — M5: fixture market-data provider (no real price API)

**Decision:** The `MarketDataProvider` interface (`getPrices(security, from,
to): Promise<PriceBar[]>`, optional `getBenchmarkPrices`) is implemented only
by `FixtureMarketDataProvider` (`MARKET_DATA_PROVIDER=fixture`, the default).
No real market-data API is wired, requested, or required.

**Rationale:** (1) the global privacy constraint forbids new third-party
network contact and API keys; (2) no paid data licenses before
product-market validation (spec §2.2, §18); (3) offline-first operation keeps
`pnpm test`/`pnpm build` hermetic. The interface is the seam: a future
licensed provider implements it (plus `benchmarkId`/`getBenchmarkPrices`
when a licensed benchmark exists) and is registered in `selectProvider()` —
no caller changes. Unknown `MARKET_DATA_PROVIDER` values warn and fall back
to `fixture`, so the build always works offline (same pattern as M4's
`MODEL_PROVIDER`).

**Fixture design:** base price levels per ticker are hand-picked to look
plausible; daily closes are a deterministic synthetic walk (FNV-1a hash of
`ticker|date`, ±1.2%/day, ±0.8% for the benchmark) — reproducible across
runs with no randomness and no network. The benchmark is a NIFTY-Pharma-like
synthetic index explicitly named `"NIFTY Pharma (fixture)"`: it is NOT the
real index. Every row carries `provider='fixture'` plus license metadata
stating the data is illustrative, per spec §9.

**MANKIND is the deliberate missing-data canary:** it has no fixture price
series, so its events permanently exercise the missing-data path (no row is
stored; nothing is fabricated or interpolated — spec §9, §17).

**Window rule (documented for audit):** with a known event time —
announcement after 15:30 IST on a trading day → event-day close → next
trading-day close; otherwise → previous trading-day close → event-day (or
next trading-day) close. Date-only events use a clearly labeled daily
window. The exact window is always stored (`window_definition`,
`window_start`, `window_end`) and displayed verbatim.

## 2026-10-01 — M5: market reactions are computed, not seeded

**Decision:** `seed.ts` no longer carries hand-written `marketReaction`
values. `seed-db.ts` runs the market-reaction pipeline
(`computeAndStoreReactions`) over the seeded events as part of seeding, and
`pnpm market:reaction` recomputes/backfills for any published events
(including newly ingested ones). Rows are upserted on
`(event_id, security_id)` — re-running refreshes, never duplicates.
Migration `005_market_reaction_nullable.sql` makes `price_before` /
`price_after` / `pct_change` nullable (missing → NULL) and adds
`window_start`, `window_end`, `license_metadata` per spec §9.

## 2026-10-01 — M6: local self-hostable auth instead of managed auth

**Decision:** spec §14 says "use managed auth (e.g., Supabase Auth) rather
than building passwords yourself". We deliberately deviate: the M6
`AuthProvider` interface is provider-shaped (signUp/signIn/signOut/
verifyToken), but the default implementation is **local** — Node built-in
`crypto.scrypt` password hashing, `crypto.randomBytes` session tokens stored
as SHA-256 hashes in Postgres (`sessions` table, migration `006_auth.sql`),
httpOnly + SameSite=Lax session cookies. No Supabase Auth, no OAuth
providers, no third-party auth services, no external network contact.

**Why:** the project-wide privacy constraint for M6 ("no third-party auth
provider, fully local") outranks the spec's managed-auth preference, and
routing every sign-in through an external service contradicts the
offline-first posture of M0–M5. The pluggable interface preserves the
spec's intent: a future managed provider implements the same five methods
and the route handlers don't change. Passwords are never logged, never
returned in API responses, and never stored outside the scrypt hash;
session tokens live only in the httpOnly cookie and as hashes in the DB.

**Alert dedupe (spec §14/§17):** strict by construction — `UNIQUE
(user_id, event_id, channel)` on `alerts` plus `INSERT ... ON CONFLICT DO
NOTHING`. Unfollowing prevents new alerts because `generateAlertsForEvent`
reads the live watchlist at ingest time; there is no subscription row to go
stale. Only `review_status = 'published'` events alert — "published"
already encodes high confidence (M4 gate: confidence ≥ 0.85).

**Test isolation:** `turbo run test` runs package suites in parallel, and
two DB-backed suites racing on one database corrupt each other's fixtures.
Following the ingestion package's precedent (`biocatalyst_ingestion_test`),
each DB-heavy suite now gets its own database: `biocatalyst_auth_test`,
`biocatalyst_notifications_test`, `biocatalyst_web_test` (created by
`pnpm db:setup`; overridable via `AUTH_TEST_DATABASE_URL` /
`NOTIFICATIONS_TEST_DATABASE_URL` / `WEB_TEST_DATABASE_URL`). The shared
`biocatalyst_test` DB keeps only the data package's seed-volume tests.


---

## 2026-09-30 — Milestone 7: additional sources (BSE India + PubMed, fixture-based)

**Why fixture-based, again.** The M3 rationale holds unchanged: where
automated access is blocked or terms are unclear, spec §7 explicitly
permits fixture-based mocks rather than bypassing access controls — and
the project's standing privacy constraint (no new third-party network
contact, no external API keys) rules out live exchange feeds and the
E-utilities API for now. Both new adapters ship behind the same
`SourceAdapter` interface, so a future live implementation only replaces
`fetchSince`/`normalize`; the pipeline, dedupe, merge, alert, and
market-reaction code paths are already exercised end-to-end against the
fixtures.

**Cross-source dedupe is trial-anchored, not text-anchored.** Matching
events across sources by headline text is brittle (announcements and
abstracts describe the same event in very different words). The
conservative alternative: a `crossSourceKey` derived only from a
resolved trial identity (`registry` + `registryTrialId`). It applies only
after the ordinary resolution gate accepts the candidate, so it can't
rescue unresolvable records. First writer wins on the event's headline,
type, and summary; the merge links the new source row and its resolved
entities into the existing event, counts `eventsMerged`, and deliberately
raises no new alert (the follower already saw the event once).

**Entity discipline for counterparties.** BSE announcements name
licensing partners and acquisition targets. Those are fictional third
parties in the fixtures — and in a live adapter they would be
unverified external entities. Either way, they must not become
`event_entities` rows (which the UI and alerts treat as canonical).
They appear as text in the headline and factual summary only. The
extractor's company regex already refuses to extract a company from
partnership/target phrasing, and tests pin this behavior.

**One ingest command for all sources.** `pnpm ingest` now runs the
registry (`packages/ingestion/src/registry.ts`) over every registered
adapter and prints a JSON array of per-source metrics;
`pnpm ingest --source bse-fixture` runs one. The admin route mirrors
this: `POST /api/v1/admin/ingestion/run` (all) and
`POST /api/v1/admin/ingestion/run?source=<name>` (single, 400 for
unknown with the known list). Registration order (`ctri`, `bse`,
`pubmed`) is deterministic; the cross-source merge does not depend on
order — whichever source writes first wins, the other merges.

## Milestone 9 — Expo mobile app (2026-10-01)

**Expo managed workflow, SDK 53, no EAS.** The mobile client is an Expo
React Native app (`apps/mobile`) rather than bare React Native, because
the managed workflow keeps the entire build reproducible locally
(`expo export` produces web + iOS + Android bundles with no cloud step).
EAS cloud build was deliberately not set up: it needs an Expo account
and ships build artifacts through Expo's servers, which the Milestone 9
"no new accounts, no third-party contact" constraint forbids. If the
user later wants store builds, `expo prebuild` + local Xcode/Android
Studio (or EAS, their choice) is the path — see `docs/deployment.md`.
Expo telemetry is disabled (`EXPO_TELEMETRY_DISABLED=1` on every
command); the app itself contains no analytics, tracking, or
third-party network calls — it talks only to `EXPO_PUBLIC_API_URL`.

**Thin client over the existing API; zero backend changes.** The app
uses a new `packages/api-client` typed client (zod-validated, mirroring
`@biocatalyst/types` with compile-time drift guards) against the
unchanged `/api/v1/*` routes. Web auth is an HttpOnly `bc_session`
cookie session; rather than weakening it (e.g. returning the token in a
response body), the client captures the raw token from the `Set-Cookie`
header after sign-in and re-attaches it as a `Cookie` header via an
injected `TokenStorage` (expo-secure-store on device). Web security
posture is unchanged; anonymous browsing works everywhere and
watchlist/alerts stay auth-gated, matching the web app.

**Push is local-only plumbing, not working push.** `expo-notifications`
is installed; the app requests permission, reads the *device* push token
via `getDevicePushTokenAsync()` (purely native, no network), persists it
in SecureStore, and POSTs it to `/api/v1/push-tokens` — which does not
exist yet (Milestone 10), so a 404 is tolerated as `{registered:false}`.
`getExpoPushTokenAsync()` was deliberately avoided: it contacts Expo's
push servers and requires an Expo account/projectId. Real delivery needs
(M10+) the backend endpoint plus FCM/APNs credentials and a development
or store build — Expo Go on SDK 53 cannot do remote push on Android.

**One `@types/react` for the whole monorepo.** Adding the mobile app
introduced a second `@types/react` (19.0.14 via react-native's peer
range alongside web's 19.3.0). pnpm's layout exposed the second copy to
`apps/web` typechecking, producing `TS2786` (Suspense not a JSX
component) and `TS4023` (type not portable) errors in web files the
mobile work never touched — `next build` failed too. Fix: pin the
mobile devDep to `19.3.0` and add a root `pnpm.overrides` pin for
`@types/react`/`@types/react-dom` (19.3.0), so the workspace can never
resolve two React type copies again. Lesson: in a pnpm monorepo, a new
package's peer ranges can silently duplicate `@types/*` and break
unrelated packages' typechecks; align them and pin via overrides.

**jest + pnpm needs a custom `transformIgnorePatterns`.** The stock
react-native pattern does not match pnpm's `node_modules/.pnpm/<pkg>/…`
layout, so `apps/mobile/jest.config.js` carries a pnpm-aware variant
(allow-listing react-native/expo/navigation/testing packages regardless
of `.pnpm` nesting). Also note `expo export` defaults to all platforms
including web, which needs `react-native-web` + `@expo/metro-runtime`
(SDK 53 pair) installed even for a native-first app.

**Pre-existing web typecheck error fixed in passing.** `tsc --noEmit`
in `apps/web` failed on `security-headers.test.ts` (M8): the JSDoc
`@type {import('next').NextConfig}` makes `config.headers` optional, so
`config.headers()` was `TS2722`. One-line fix (assert defined, then
`headers!()`) — test-only, no runtime change. Verified it predates M9
(file mtimes and dependency versions both pre-session).

## 2026-10-01 — Live data sources (user-authorized): ClinicalTrials.gov, GDELT, Yahoo Finance

**Decision:** Three free, keyless live data integrations were implemented at
the user's explicit request, alongside (not replacing) the fixtures:
(1) `ctgov` ingestion adapter — ClinicalTrials.gov API v2, sponsor search
over the 10 tracked companies, first-run 90-day lookback, lead-sponsor
entity resolution against the canonical catalog;
(2) `gdelt` ingestion adapter — GDELT DOC 2.0 `artlist`, first-run 7-day
lookback, English titles naming a tracked company, keyword classification
into the closed taxonomy (`company_pipeline_update` fallback);
(3) `yahoo` market-data provider (`MARKET_DATA_PROVIDER=yahoo`) — real
delayed daily NSE (`.NS`) / BSE (`.BO`) OHLCV bars. Fixtures remain the
defaults, so tests/builds stay hermetic and the app works fully offline.

**Why this is compatible with the privacy constraint:** the three providers
need no API keys, no accounts, and no credentials; the adapters send only
the minimal queries the task requires (sponsor names, company news phrases,
ticker symbols) to exactly those providers — no telemetry, analytics, or
other third parties. Trial/news records are ingested as *candidate* events
subject to the same conservative entity resolution, deduplication,
extraction-review, and admin-approval pipeline as fixtures.

**Honesty rules preserved:** (a) Yahoo bars never invent fields — null
OHLCV legs stay absent; HTTP errors/rate limits/missing symbols return `[]`
so downstream keeps its null behavior (no benchmark → benchmark fields stay
null, never fabricated); (b) the Yahoo endpoint is unofficial and its
license metadata says personal/research use, no redistribution; (c) GDELT
is rate-limit sensitive — the shared `fetchJson` helper retries transient
429/5xx with backoff, persistent failures still surface as failed runs;
(d) `ctgov`/`gdelt` emit only docs whose company resolves to the catalog —
real-world names (e.g. "Biocon Biologics UK PLC") map via
`adapters/company-map.ts`, unresolved candidates are rejected.

**Verified 2026-10-01:** live smoke test from this machine — ctgov returned
4 real trial updates (7d window: Lupin Phase 3 status change, Biocon Phase 1
result + update); Yahoo returned real NSE bars for BIOCON/SUNPHARMA/DRREDDY/
CIPLA/DIVISLAB/LUPIN (5 days each). GDELT could not be verified from this
machine (VM datacenter IP is persistently HTTP-429 throttled by GDELT even
after 45s spacing); the adapter code is unit-tested and the retry path is
covered — it should be re-verified from the user's network. Yahoo BSE
coverage is per-symbol spotty (e.g. `SUNPHARMA.BO` returned no bars while
`BIOCON.BO` returned 40) — missing data stays null, never backfilled from
NSE.

## 2026-10-01 — Companies browse page, categories, and watchlist buttons everywhere

**Ask:** (1) the companies surface should list companies in general, not only
via search; (2) categories — sub-field specific plus a few broad ones;
(3) a follow/+ button directly on the list; (4) in the feed, wherever one or
more companies are mentioned, an option to add them to the watchlist.

**What was built:**
- New `/companies` page (nav: Feed · Companies · Search · Watchlist) listing
  all 10 tracked companies with category filter chips. Categories are curated
  in `apps/web/src/lib/company-categories.ts` (keyed by company slug, no
  schema migration): broad = Generics; sub-field = Biosimilars & biologics,
  API & CDMO, Specialty & innovative, Vaccines, Consumer health. A company
  appears under every category it belongs to (e.g. Aurobindo under Generics,
  API & CDMO, and Biosimilars).
- New `listCompanies()` in `@biocatalyst/data` (alphabetical, DB-backed).
- Compact `+`/`✓` variant of `FollowButton`, used on: the `/companies` rows,
  the search-page company rows, every feed card (overlay, top-right — kept
  outside the card `<Link>` so the HTML stays valid), and next to each company
  link on event detail pages.
- `EventCard.company` (types + `toEventCard` + api-client zod schema +
  drift guard + mobile test fixture) now carries `id` and `slug` so feed
  cards can target the follow action.
- `lib/watchlist.ts` now shares one cached watchlist fetch across all mounted
  buttons (30 feed cards = 1 request, not 30); follow/unfollow invalidate the
  cache so every button re-renders from fresh state.

**Verified 2026-10-01:** full repo green — build 11/11, typecheck 20/20,
lint 11/11, tests 287/287 (was 275; +12 new: company-categories 4, watchlist
dedup 4, FollowButton compact 2, data-layer listCompanies/toEventCard 2).
Production `next build` + `next start` smoke test: `/companies` 200 with 10
follow buttons, `?category=biosimilars` returns exactly Biocon/Dr Reddy's/
Lupin/Aurobindo, feed renders 30 follow buttons, search + event pages 200.

## 2026-10-01 — 20 companies, Explore hub (disease areas + modalities)

**Ask:** (1) only 10 companies — increase the count; (2) a browsable list of
diseases/issues (e.g. Cancer → all cancer-related stuff; peptides → peptide
stuff); (3) more change suggestions; (4) is X/Twitter ingestible?

**What was built:**
- Catalog grew 10 → 20: Alkem, Ipca, Glenmark, Laurus Labs, Ajanta, Natco,
  J.B. Chemicals, Granules India, Piramal Pharma, Alembic (seed.ts). NSE/BSE
  tickers + curated aliases included, so Yahoo market data and the ctgov/gdelt
  company matcher (company-map.ts) cover them with no extra work.
- New additive seeder `pnpm --filter @biocatalyst/data seed:companies`
  (`packages/data/src/seed-companies.ts`): inserts only companies missing by
  slug — safe on databases that already hold live-ingested data. `seed:db`
  TRUNCATEs everything and must NOT be re-run on a live DB.
- New `/explore` hub (nav: Feed · Companies · Explore · Search · Watchlist)
  with two browse dimensions: 7 disease areas (Oncology; Diabetes, obesity &
  metabolic; Respiratory; Autoimmune & inflammation; Bone health; Brain &
  mental health; Vaccines & infectious disease) and 5 modality groups
  (Biologics & biosimilars; Small molecules; Complex generics; Vaccines; APIs
  & intermediates), curated in `apps/web/src/lib/explore-taxonomy.ts`. Every
  seed indication lives in exactly one area; every seed modality in exactly
  one group (pinned by tests). Area/modality detail pages show drugs, trials,
  events and companies with follow buttons; they resolve against live DB
  data, so newly ingested items appear automatically.
- New data functions: `listDrugs()`, `getDrugsByIndications()`,
  `getTrialsByIndications()`.

**Verification notes (2026-10-01):** this VM lost its PostgreSQL install
mid-session (VM replacement) and apt mirrors were unreachable, so DB-backed
tests and the production build could not be re-run here. Verified: full repo
typecheck 20/20, new unit tests 14/14 (explore-taxonomy 4,
company-categories 4 incl. all 20 slugs, watchlist dedup 4, FollowButton
compact 2), ingestion pure-unit tests 56 passed (only DB-backed run.test.ts
fails — no database). New SQL follows existing proven query shapes; ON
CONFLICT targets match real UNIQUE constraints in 001_init.sql. The Mac's
rebuild (real Postgres) is the final confirmation.

**X/Twitter as an ingestion source:** not viable. X retired its free tier
(Feb 2026); API access is now pay-per-use at ~$0.005 per post read, credits
upfront, no free allowance. Scraping is login-walled and against ToS.
Recommendation: skip — GDELT already captures the news cycle that social
amplifies, and the budget is better spent on more publishers via GDELT.

## Four-feature build (2026-10-02): catalyst calendar, company compare, watchlist digest, press-release RSS

**Catalyst calendar** (`/calendar`): `getUpcomingTrials()` in
@biocatalyst/data returns trials with `primary_completion_date >=
CURRENT_DATE`, soonest first (with sponsor + drug hydration). Page groups by
month. Uses seeded `primary_completion_date`s (sponsor guidance, labeled as
such).

**Company compare** (`/compare?a=slug&b=slug`): side-by-side columns with
overview, pipeline (drug count + trial phase counts), 5 recent events, and
recent market moves. New `getRecentReactionsForCompany()` in
@biocatalyst/data reads `market_reactions` joined to `securities`+`events`,
newest first. Client-side company pickers navigate via router.

**Watchlist digest** (`/digest`): `getDigest()` in @biocatalyst/notifications
groups the user's UNREAD in-app alerts by company, newest first. This is the
periodic summary — everything since the user last marked alerts read; reading
alerts shrinks it, mark-all-read empties it. Anonymous users get a sign-in
prompt. Reuses the existing alerts pipeline (no new tables, no cron).

**Press-release RSS** (`press-rss` source): new live adapter in
`packages/ingestion/src/adapters/rss.ts` with a minimal dependency-free RSS
2.0/Atom parser and keyword classifier mapping headlines to the closed event
taxonomy. Feed owner is the event's company (no name-guessing); non-catalyst
items (earnings, CSR) get null eventType and the runner drops them.
Confidence 0.9 for regulatory approvals (own-feed announcement naming the
regulator), 0.8 otherwise (→ pending_review). Added `fetchText` to the shared
HTTP helper with the same retry/timeout discipline as `fetchJson`.
Registered in `ADAPTER_FACTORIES`; `pnpm ingest --source press-rss` works.

**Feed verification (2026-10-02, live):** of 20 tracked companies only Sun
Pharma (`https://www.sunpharma.com/feed/`) serves a current, item-bearing
press-release RSS. Others 404, serve empty WordPress feeds, are stale
(JB Pharma: 2021 items), or block (Torrent: 403). PRESS_FEEDS ships with Sun
only; add feeds only after verifying HTTP 200 + dated items.

**Verification notes (2026-10-02):** this VM regained PostgreSQL 16
(system packages, pgcrypto+pg_trgm present) — full DB-backed verification ran
here. Fixed a latent SQL bug the new tests caught: `getTrialsByIndications`
used `SELECT DISTINCT` with `ORDER BY t.primary_completion_date` (not in
select list) — changed to order by the output alias. Full suite green:
web 69/69, data 28/28, notifications 10/10, ingestion 92/92, api-client 27,
extraction 36 passed/11 skipped, market-data 28 passed/4 skipped. Production
`next build` clean; smoke-tested `/calendar` (26 trials), `/compare`
(both companies + market moves), `/digest` (anon prompt, signed-in digest
with 3 alerts, mark-all-read → "all caught up"). Live end-to-end: press-rss
adapter fetched Sun Pharma's real feed → 1 event created
(licensing_or_partnership, linked to Sun Pharma, published).

## Company expansion 20 → 30 (2026-10-02)

**Landscape:** ~24,000 pharma companies in India total, but only ~85-130
listed (NSE/BSE) — the trackable universe. The 20 covered most of Nifty
Pharma; this batch adds the 10 most notable missing listed names.

**Added (all NSE+BSE listed, tickers verified live 2026-10-02):**
Gland Pharma (GLAND, injectables CDMO), Abbott India (ABBOTINDIA, MNC branded
generics), Wockhardt (WOCKPHARMA, antibiotics/biotech), Sai Life Sciences
(SAILIFE, CRDMO, listed Dec 2024), Sanofi India (SANOFI, MNC), Pfizer Ltd
(PFIZER, MNC), Strides Pharma Science (STAR, generics/sterile injectables),
Syngene International (SYNGENE, Biocon CRDMO), Neuland Laboratories
(NEULANDLAB, API/peptides CDMO), Shilpa Medicare (SHILPAMED, oncology API).

**Touched:** `packages/data/src/seed.ts` (companies array — the single source;
`seed-companies.ts` reads it, so the additive seeder picks up the 10 with no
changes), `packages/ingestion/src/adapters/company-map.ts` (matcher aliases),
`apps/web/src/lib/company-categories.ts` (Gland/Sai/Syngene/Neuland/Shilpa →
API & CDMO; Abbott/Sanofi → consumer health; Wockhardt/Strides → generics;
Sanofi/Pfizer → specialty/vaccines).

**Tests:** db.test.ts assertions 20→30 companies (drugs/trials stay 20);
company-categories.test.ts slug list extended. Verified: data 28/28,
ingestion 92/92, web typecheck clean, categories tests 4/4.

## 2026-10-02 — Full NSE pharma universe: 30 → 134 companies

User asked for "all the available ones". Pulled the complete NSE pharmaceutical
sector list from ET Money (134 companies, "Showing 134 of 134 stocks",
tickers verified against ET Money's own quote data 2026-10-02) and added the
104 missing names to the catalog. This is now the entire listed pharma
universe on NSE — the trackable universe for market data and ingestion.

**BSE ticker resolution (corrects the earlier scare):** the previous session
flagged BSE records as broken because numeric BSE scrip codes (e.g. 543245)
were assumed correct. Live verification against Yahoo's chart API on
2026-10-02 proved the opposite: `<TICKER>.BO` (text symbol, e.g. GLAND.BO)
returns real BSE price data (HTTP 200, INR bars), while numeric codes
(543245.BO, 500488.BO) return HTTP 404. So the seed's existing convention
(NSE symbol as BSE ticker → `<SYMBOL>.BO`) is CORRECT for the Yahoo provider.
Verified all 134 tickers: 129 have working `.BO` symbols; 5 (BETA, VAISHALI,
BALAXI, ZOTA, PAR) are NSE-only and carry NSE securities alone.

**Websites:** spot-verified the uncertain ones (ortinlabsindia.com,
haleoslabs.com, acutaas.com, viyash.com, onesourcecdmo.com, unichemlabs.com);
fixed Ortin Global (was a guessed ortinglobal.com) and Unichem (was
unichemlaboratories.com, plus removed an unverified Torrent-acquisition claim).

**Matcher hygiene:** removed 18 single-word keys that are common English words
or substrings of common words (beta, corona, innova→innovation, entero→
enterovirus, sms, anthem, panacea, nectar, bliss, valiant, orchid, lincoln,
brooks, medico, sunil, venus, eris, makers) to avoid false substring matches
in ingestion; longer keys retained. All 134 canonical names resolve.

**Scope note:** SPONSOR_QUERIES / NEWS_PHRASES still cover only the original
10 companies (unchanged since the 20-company expansion) — live ingestion
stays focused; the full 134 are browsable and market-trackable.

**Tests:** db.test.ts company counts made dynamic via `companies.length`
(no more hardcoded 30); categories test slug list extended to 134. Verified:
data 28/28, ingestion 92/92, web 69/69, market-data 32/32, notifications 10/10,
all typechecks clean, production `next build` clean (dev DB recreated in VM:
biocatalyst_dev + biocatalyst_market_test were missing after the VM's Postgres
restore).
