# Biocatalyst India

India-focused biotech & pharmaceutical **catalyst intelligence** — a web PWA
that connects verified-style facts, concise summaries, catalyst events,
source links, listed companies/tickers, and transparent post-event market
reaction.

> **Milestones 0–3 done.** Companies, drugs, trials, seed events and market
> figures are **seed fixtures** — realistic placeholders, not real
> announcements or real market data. In addition, Milestone 3 adds
> **fixture-ingested events** from a mock CTRI adapter (`ctri-fixture`):
> these come from five hand-curated fictional CTRI-shaped JSON records
> (no network), each with full provenance, and are clearly badged in the
> code/docs as fixture data. Every screen badges fixtures as such.

Full product/engineering source of truth: the build spec
(`~/workspace/user/files/muse_build_spec.pdf` in the author's workspace).

## Quick start (exact commands)

Prerequisites: Node.js ≥ 20, pnpm 10 (`npm install -g pnpm@10`).

```bash
cd biocatalyst-india
pnpm install     # 1. install all workspace dependencies
pnpm db:setup    # 2. create local Postgres role/DBs, migrate, load seed fixtures
pnpm build       # 3. typecheck + build all packages
pnpm test        # 4. run unit/integration tests (incl. DB-backed tests)
pnpm dev         # 5. start the web app → http://localhost:3000
```

That's the whole local setup: no API keys, no paid services — just a local
Postgres (see "Database" below).

## Telemetry

The app itself sends **no analytics or tracking**. The only
`telemetry.vercel.com` calls come from the Next.js CLI's built-in anonymous
usage telemetry (and Turborepo's equivalent) — neither is required for the
app to function, and both are disabled project-wide via
`NEXT_TELEMETRY_DISABLED=1` and `TURBO_TELEMETRY_DISABLED=1` in
`.env.example` (copy to `.env` / export in your shell to apply). The local
Next.js telemetry config is also opted out (`next telemetry disable`).

## Database

Milestone 2 uses a local PostgreSQL for development and tests (production
path: Supabase free tier — not wired up yet).

```bash
pnpm db:setup     # create role + databases, run migrations, load seed fixtures
pnpm db:migrate   # apply pending migrations only
pnpm db:seed      # (re)load seed fixtures into the dev database
pnpm db:reset     # drop, recreate, migrate, reseed — clean slate
```

`DATABASE_URL` defaults to
`postgresql://biocatalyst:biocatalyst@localhost:5432/biocatalyst_dev`
(see `.env.example`); tests use `.../biocatalyst_test`, and the
DB-backed suites each get an isolated database —
`biocatalyst_ingestion_test`, `biocatalyst_extraction_test`,
`biocatalyst_market_test`, `biocatalyst_auth_test`,
`biocatalyst_notifications_test`, `biocatalyst_web_test` — so parallel
test runs can't interfere (see `docs/decisions.md`).
On macOS, install/start PostgreSQL with Homebrew (`brew install postgresql@16`
and `brew services start postgresql@16`); `pnpm db:setup` then uses the local
admin user. On Linux it uses `sudo -u postgres` for the one-time role/database
creation.

## Ingestion (Milestones 3 & 7)

Three compliant source adapters run end-to-end behind the
`SourceAdapter` interface, all **fixture-based mocks** with zero network
requests (spec §7 explicitly permits fixture-based mocks where automated
access is blocked or terms are unclear; rationale in
`docs/decisions.md`):

- `CtriFixtureAdapter` (`sourceName: "ctri-fixture"`) — five fictional,
  hand-curated CTRI-shaped JSON records (M3).
- `BseFixtureAdapter` (`sourceName: "bse-fixture"`) — five fictional
  BSE corporate-announcement records: regulatory approval, licensing,
  acquisition, a trial-result, and a regulatory submission (M7).
- `PubmedFixtureAdapter` (`sourceName: "pubmed-fixture"`) — three
  fictional PubMed abstracts, all `scientific_publication` (M7).

```bash
pnpm ingest                    # all registered adapters → JSON array of per-source metrics
pnpm ingest --source bse-fixture  # one adapter only
```

- Content-hash + event-fingerprint dedupe (re-runs are idempotent);
  **cross-source dedupe** merges the same trial's records across sources
  into one event via a trial-anchored `cross_source_key` (first writer
  wins, no duplicate alert; migration `007_cross_source_key.sql`).
- Provenance per event: `sources` row (publisher, URL, content hash),
  `event_sources` link, `raw_snapshots` archive; run metrics in
  `ingestion_runs`, resume cursor in `ingestion_cursors` (migrations
  `003_ingestion.sql`, `007_cross_source_key.sql`).
- Licensing partners / acquisition targets named in BSE announcements
  stay text-only mentions — they are never linked as entities.
- Admin endpoints (dev-gated, or `Authorization: Bearer <ADMIN_TOKEN>`
  outside development — see `docs/runbook.md`):
  `GET /api/v1/admin/health` (DB status + per-source health metrics) and
  `POST /api/v1/admin/ingestion/run` (trigger a pass for all sources, or
  `?source=<name>` for one; returns per-source metrics).

## AI extraction (Milestone 4)

Every ingested document is extracted into the spec §8.2 structured schema
via the `ExtractionProvider` interface (`packages/extraction`) — fully
offline, no model API keys, no network:

```bash
MODEL_PROVIDER=deterministic pnpm ingest   # default: rule/template extractor
MODEL_PROVIDER=mock pnpm ingest            # fixture "model" (canned outputs)
```

- **Schema** (`§8.2`, Zod-validated): closed-taxonomy `event_type`,
  company/drug/trial/indication names, `ticker_candidates`, `phase`,
  `outcome` (`primary_endpoint_met | primary_endpoint_missed | unknown`),
  `facts[]` (`{claim, source_span, confidence}`), `published_at`,
  `confidence`. Invalid payloads are rejected.
- **Guardrails** (spec §8.3): never invents numeric values, trial IDs,
  endpoints, dates, or company relationships (missing → null/empty);
  ambiguous outcome language → `unknown` + lowered confidence; every fact
  carries a verbatim `source_span`; endpoint claims below 0.85 confidence
  → `pending_review`, never auto-published.
- **Caching** (spec §8.1): `extractions` table keyed on
  `(document_hash, provider, prompt_version, schema_version)` — same
  document + same versions is never re-extracted (migration
  `004_extraction.sql`).
- **Deterministic fallback** (spec §17): provider errors or invalid JSON
  resolve to template extraction, confidence capped at 0.5, flagged
  `pending_review` — the pipeline never crashes.
- **Summaries**: `factual_summary` (80–150 words) and `catalyst_summary`
  (neutral operational relevance, no investment language — spec §6) are
  generated from structured facts via deterministic templates.
- **Review queue**: `GET /api/v1/admin/health` now embeds `reviewQueue`
  (pending count + lowest-confidence items with extraction provenance);
  `GET /api/v1/admin/review-queue` lists it directly. No review UI yet.

Why no real model is wired (cost, keys, offline-first): `docs/decisions.md`.

## Market reaction (Milestone 5)

Post-event price movement is computed per spec §9 behind a replaceable
`MarketDataProvider` interface (`packages/market-data`) — fully offline, no
price API keys, no network:

```bash
pnpm market:reaction   # compute/backfill §9 reactions (idempotent)
```

- **Provider** (`MARKET_DATA_PROVIDER=fixture`, the default): hand-curated
  fixture price series for the seeded NSE tickers plus a synthetic
  NIFTY-Pharma-like benchmark, all clearly marked as illustrative fixtures.
  Unknown provider names warn and fall back to `fixture`. A future licensed
  provider implements the same interface — no caller changes.
- **Math** (spec §9 exactly): `price_before` = latest close before the event
  window; `price_after` = selected close after; `pct_change` =
  `(after/before − 1) × 100`; benchmark-relative `relative_change =
  pct_change − benchmark_change`. Missing data → NULLs, never fabricated
  or interpolated; benchmark fields omitted when benchmark data is
  unavailable.
- **Window**: always stored (`window_definition`, `window_start`,
  `window_end`) and displayed verbatim, e.g. "NSE close on 2026-09-28 → NSE
  close on 2026-09-29 (announcement 2026-09-29 08:15 IST — before market
  open)"; date-only events get a clearly labeled daily window.
- **Provenance**: every `market_reactions` row carries provider name +
  license/usage metadata; bars measured from are persisted to
  `market_prices`. UI copy is non-causal ("market reaction around the
  event", never "caused by").

Why no real price API is wired (keys, licenses, offline-first):
`docs/decisions.md`.

## Auth & alerts (Milestone 6)

Managed-style authentication without any third-party provider: a pluggable
`AuthProvider` interface (`packages/auth`) whose default is a local,
self-hostable implementation — scrypt password hashing (Node built-in),
random session tokens stored as SHA-256 hashes in Postgres, httpOnly +
SameSite=Lax cookies, 30-day expiry. Sign up/in at `/signup`, `/signin`;
the header shows a notification bell with the unread-alert count.

- **Watchlists** (spec §12): `GET`/`POST /api/v1/watchlist` and `DELETE
  /api/v1/watchlist/{entity_type}/{entity_id}` — auth required; the M1
  localStorage mock is gone. Follow/unfollow buttons live on company and
  drug pages; `/watchlist` shows followed entities.
- **In-app alerts** (spec §14): when a new published (high-confidence)
  catalyst is ingested for a followed company/drug, each follower gets one
  in-app alert — strictly deduped by `(event_id, user_id, channel)`, so
  re-ingests never duplicate. Unfollowing instantly stops new alerts for
  that entity. `/alerts` is the notification center (per-alert and mark-all
  read). Email/push are later milestones.
- **Security**: `/api/v1/auth/*` rate-limited to 20 req/min per IP (vs 120
  elsewhere), Zod-validated inputs, no password/token logging, passwords
  never in API responses. Anonymous browsing (feed, entity pages, search)
  keeps working — auth gates only watchlists and alerts.

Why no third-party auth provider (local-first privacy): `docs/decisions.md`;
session/env notes: `docs/runbook.md`.

## What's implemented (Milestones 0–9)

- **Monorepo**: pnpm + Turborepo. `apps/web` (Next.js 15 + TypeScript PWA),
  `packages/types` (canonical types mirroring spec §5),
  `packages/data` (async data-access layer over Postgres),
  `packages/db` (Postgres client, SQL migrations, no ORM),
  `packages/auth` (pluggable auth provider interface + local self-hostable
  implementation), `packages/notifications` (in-app alert generation +
  read state).
- **Database** (Milestone 2): canonical Postgres schema per spec §5 — UUID
  primary keys, provenance columns, trigram search indexes. Plain-SQL
  migrations (`packages/db/migrations`), idempotent seed from the M1
  fixtures (`pnpm db:seed`), Zod validation on all API inputs, and
  per-IP rate limiting (120 req/min) on `/api/v1/*`.
- **Seed data**: 10 India-linked pharma/biotech companies (Sun Pharma,
  Dr Reddy's, Cipla, Biocon, Divi's, Lupin, Aurobindo, Zydus, Torrent,
  Mankind), 20 drugs, 20 trials, 30 catalyst events — every event with
  source URLs + published/retrieved timestamps. Market reactions are
  computed by the M5 pipeline from fixture price series (not hand-seeded)
  and carry exact measurement windows, provider, and license metadata.
- **Screens** (spec §4): Home/Catalyst Feed with event-type filters, Event
  Detail (fact box, summary, "why this matters", market reaction, sources,
  data quality), Company / Drug / Trial pages, universal Search, Watchlist
  (server-backed, auth-gated), notification center at `/alerts`, `/signin`
  and `/signup` pages, and a header bell with the unread-alert count.
- **API** (spec §12): `GET /api/v1/events` (cursor pagination +
  filters), `/api/v1/events/{id}`, `/api/v1/companies/{slug}`,
  `/api/v1/companies/{slug}/events`, `/api/v1/drugs/{slug}`,
  `/api/v1/trials/{registry}/{trial_id}`, `/api/v1/search?q=`,
  `GET /api/healthz`, plus the M6 auth/watchlist/alerts surface:
  `POST /api/v1/auth/signup`, `POST /api/v1/auth/signin`,
  `POST /api/v1/auth/signout`, `GET /api/v1/auth/session`,
  `GET`/`POST /api/v1/watchlist`, `DELETE
  /api/v1/watchlist/{entity_type}/{entity_id}`, `GET /api/v1/alerts`,
  `POST /api/v1/alerts/{id}/read`, `POST /api/v1/alerts/read-all`.
- **Auth** (Milestone 6, spec §14): local self-hostable auth behind a
  pluggable `AuthProvider` interface (no third-party providers, no OAuth —
  rationale in `docs/decisions.md`). Passwords hashed with scrypt (Node
  built-in), random session tokens stored as SHA-256 hashes in Postgres
  (migration `006_auth.sql`), httpOnly + SameSite=Lax cookies, 30-day
  expiry (`AUTH_SESSION_TTL_DAYS`). Stricter rate limiting on
  `/api/v1/auth/*` (20 req/min per IP vs 120 elsewhere). Anonymous browsing
  of the feed, entity pages and search keeps working — auth gates only
  watchlists and alerts.
- **In-app alerts** (Milestone 6, spec §14): when a new *published*
  (high-confidence, ≥ 0.85) catalyst is ingested for a followed
  company/drug, one in-app alert is created per follower — strictly deduped
  by `(event_id, user_id, channel)` (DB unique constraint, so re-ingests
  and parallel runs can't duplicate). Unfollowing instantly stops new
  alerts for that entity. Email/push channels come in later milestones.
- **PWA**: `manifest.webmanifest`, minimal service worker, generated icons —
  installable where supported, responsive down to mobile widths.
- **Additional sources** (Milestone 7): two more fixture-based adapters
  behind the same interface — `BseFixtureAdapter` (BSE corporate
  announcements: approval, licensing, acquisition, trial results,
  submission) and `PubmedFixtureAdapter` (scientific publications). An
  adapter **registry** (`packages/ingestion/src/registry.ts`) runs all
  sources in one `pnpm ingest` pass (`--source <name>` for a single
  one). Trial-anchored **cross-source dedupe** merges the same trial's
  records from different sources into one event (first writer wins, no
  duplicate alert; `events.cross_source_key` partial unique index,
  migration `007_cross_source_key.sql`). Counterparties named in BSE
  records (licensing partners, acquisition targets) are text-only
  mentions, never entities. New-source events flow through the same
  extraction → alerts → market-reaction pipelines; the Mankind event
  re-proves the missing-price-data path (no row fabricated).
- **Tests**: 191 passing — 47 extraction tests (schema validation,
  guardrails, content-hash caching, prompt/schema versioning,
  deterministic fallback, summary templates), 53 ingestion tests
  (CTRI/BSE/PubMed adapter normalization + dedupe, end-to-end pipeline
  incl. extraction wiring, alert hooks, cross-source merge,
  multi-adapter runs, provenance, health), 25 market-data tests (§9 math,
  window edge cases, benchmark-relative math, fixture provider,
  idempotent recompute), 20 DB integration tests (incl. review-queue
  query), 29 web tests (incl. market-reaction panel copy, auth flow,
  watchlist API, auth-gating, auth rate limits, anonymous public access),
  11 auth tests (signup/login/logout, session persistence + expiry,
  credential hygiene), 6 notification tests (alert creation, strict
  dedupe, unfollow stops alerts, non-published silence, read state).
  Vitest seed-integrity tests encode the M1 acceptance criteria
  (provenance, taxonomy, entity linkage, market-reaction math + windows,
  search resolution, pagination).

## Repo map

| Path | Purpose |
|---|---|
| `apps/web/` | Next.js PWA |
| `packages/types/` | Canonical TypeScript types |
| `packages/data/` | Async data-access functions (DB-backed) + seed fixtures |
| `packages/db/` | Postgres client + SQL migrations |
| `packages/ingestion/` | Source adapters, ingestion pipeline, `pnpm ingest` CLI |
| `packages/auth/` | `AuthProvider` interface + local self-hostable auth (scrypt, DB sessions) |
| `packages/notifications/` | In-app alert generation (dedupe) + read state |
| `packages/extraction/` | AI extraction: provider interface, §8.2 schema, guardrails, caching, fallback, summaries |
| `packages/market-data/` | Market-data provider interface, §9 calculation, `pnpm market:reaction` CLI |
| `packages/api-client/` | Typed `/api/v1/*` HTTP client (zod-validated) for the mobile app |
| `apps/mobile/` | Expo React Native mobile app (Milestone 9) |
| `docs/` | `decisions.md` · `architecture.md` · `data-sources.md` · `runbook.md` · `deployment.md` |
| `scripts/` | `generate-icons.mjs` — dependency-free PWA icon generator |

## Milestone 8 — production PWA readiness (local only)

Everything in this section was verified **locally** — no accounts created,
no deploys executed, no third-party services configured (see
`docs/deployment.md` for the options + what you'd need to provide).

- **Legal pages**: `/privacy`, `/terms`, `/disclaimer` (footer-linked),
  covering informational-only use (not medical / not investment advice),
  data sources & fixture status, retention, and contact.
- **Report an issue**: every event page's "Data quality" panel has an inline
  form posting to `POST /api/v1/issues` (anonymous, Zod-validated, stored
  in-app — migration `008_issue_reports.sql`). Admins triage reports at
  `/admin/issues` (token-gated via the existing `isAdminRequest` gate).
- **PWA**: manifest (icons 192/512 incl. maskable verified, theme_color,
  `display: standalone`), service worker with an `/offline` fallback page.
- **Security headers** (`next.config.mjs`): `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`, same-origin-only CSP. The app loads
  zero third-party resources (no analytics — asserted by a build-scan test).
- **Backup/restore**: `bash scripts/db-backup.sh` / `bash
  scripts/db-restore.sh` (see "Backup & restore" in `docs/runbook.md`).
- **Monitoring without third parties**: cron hitting
  `/api/v1/admin/health` + log file; `ingestion_runs` is the source of
  truth. Sentry/analytics deliberately not integrated.

Production smoke check (after `pnpm build`):
`DATABASE_URL=<redacted> pnpm --filter @biocatalyst/web start`
then verify `/`, an event page, `/search`, `/privacy`, `/admin/issues`.

## Milestone 9 — Expo mobile app (local only)

Everything in this section was verified **locally** — no accounts created,
no EAS/cloud builds, no push credentials configured, no telemetry
(`EXPO_TELEMETRY_DISABLED=1` on all commands; see `docs/decisions.md`).

- **New packages**: `@biocatalyst/api-client` — typed fetch client over the
  unchanged `/api/v1/*` routes (zod v4 validation with compile-time drift
  guards against `@biocatalyst/types`); `@biocatalyst/mobile`
  (`apps/mobile`) — Expo SDK 53 app (managed workflow).
- **Auth without API changes**: the app captures the `bc_session` token
  from the `Set-Cookie` header after sign-in and re-attaches it as a
  `Cookie` header (SecureStore-backed token storage). No token in any
  response body — web session security unchanged.
- **Screens** (spec §4): Feed (filter chips, cursor pagination,
  pull-to-refresh), Event detail (fact box, market-reaction window +
  provider, sources, confidence), Company/Drug/Trial pages, debounced
  grouped Search, Sign in/up, Watchlist (unfollow), Alerts (mark
  read/all-read), Account (push toggle, API URL display). Anonymous
  browsing everywhere; watchlist/alerts auth-gated like the web app.
- **Push — plumbing + registration, not delivery**: `expo-notifications`
  requests permission, reads the *device* token
  (`getDevicePushTokenAsync()`, no network), stores it in SecureStore,
  and POSTs to `/api/v1/push-tokens` (added in M10: auth-required,
  idempotent). `getExpoPushTokenAsync()` is deliberately unused
  (contacts Expo's servers). Real delivery needs FCM/APNs credentials + a
  dev/store build — see `docs/deployment.md` for exactly what you'd need
  to provide.
- **Run it**: `pnpm --filter @biocatalyst/web dev` plus
  `EXPO_PUBLIC_API_URL=http://<lan-ip>:3000 pnpm --filter
  @biocatalyst/mobile dev`, scan the QR with Expo Go. `expo export`
  verified locally (web + iOS + Android bundles in
  `apps/mobile/dist/`). Full docs: `apps/mobile/README.md`.

## Milestone 10 — Store readiness (local only, final milestone)

Everything in this section was prepared **locally** — no store
submissions, no developer accounts, no third-party crash reporting, no
telemetry (`EXPO_TELEMETRY_DISABLED=1` on all commands), no secrets
committed. The app is store-*ready*; submission itself is a user action
(see `docs/deployment.md` for the consolidated user-provided checklist).

- **App icons/splash** (`apps/mobile/assets/`, generated locally by
  `node scripts/generate-mobile-icons.mjs` — zero-dependency pure-Node PNG
  writer, no external image services): `icon.png` 1024×1024 (App Store
  requirement), `adaptive-icon.png` 1024×1024 foreground (mark inside the
  66% safe zone; navy background via config), `splash.png` 1024×1024,
  `favicon.png` 48×48. Wired in `app.json` (`icon`, `splash`,
  `ios.icon`, `android.adaptiveIcon`).
- **Push backend, minimal**: `POST /api/v1/push-tokens` (migration
  `009_push_tokens.sql`, `push_tokens` table, Zod validation,
  auth-required, idempotent upsert, per-user isolation). Registration
  storage only — actual push **fan-out still needs FCM/APNs credentials**
  and is deferred (see `docs/deployment.md`).
- **Permissions** (`docs/store/permissions.md`): notifications are the
  only runtime permission (exact in-app rationale copy documented); no
  camera/location/mic/contacts/calendar. Android manifest permissions
  (`POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`) come from the
  `expo-notifications` library merge — `app.json` deliberately does not
  pin `android.permissions`.
- **Privacy labels** (`docs/store/privacy-labels.md`): Apple App Privacy
  and Google Play Data safety answers grounded in actual behavior (account
  email + push token on the user's own server only; no analytics, no
  tracking, no third-party SDKs, no data sold). Items needing live
  verification are flagged "verify before submission".
- **Screenshots** (`docs/store/screenshots.md`): shot list for iPhone
  6.7"/6.5", iPad 13", Android phone + 7"/10" tablets — executable by the
  user on simulators/devices (no toolchains here).
- **Build config** (`docs/store/build.md`): `expo prebuild` flow,
  version/versionCode/buildNumber strategy, Android `keytool` keystore
  commands (throwaway examples only), iOS Xcode signing, and exactly what
  the user must provide.
- **Crash reporting** (`docs/store/crash-reporting.md`): decision recorded
  — no Sentry/Crashlytics per the no-third-party rule; what is lost; a
  deferred self-hosted error-log endpoint design.
- **Listing copy** (`docs/store/listing.md`): name, tagline, description,
  keywords, categories, age-rating guidance, URL/contact placeholders,
  1.0.0 release-notes template.
- **Privacy policy** (`/privacy`): now discloses device push-token storage
  and retention. Operator contact address: `bio1941999@gmail.com`
  (set 2026-10-01).
- **Tests**: 15 new mobile store-readiness assertions (icon sizes,
  `app.json` wiring, permission audit, docs completeness) + 6 new web
  tests for `POST /api/v1/push-tokens`.

## Guardrails (spec §21)

Informational product only: no medical advice, no investment advice, no
buy/sell/hold calls or price targets. Catalyst summaries explain operational
relevance; market reaction is shown as "around the event", never as caused
by it.

## Roadmap

Milestone 2 done: canonical Postgres schema + typed API over the same
contracts, seed migration, DB-backed pagination/search tests, Zod
validation, rate limiting. Milestone 3 done: first compliant source
adapter (fixtures, dedupe, provenance, health metrics, admin endpoints) —
see `CHANGELOG.md`. Milestone 5 done: market-data adapter + §9
market-reaction calculations (fixture provider, benchmark support,
idempotent `pnpm market:reaction` backfill). Milestone 6 done: local auth,
server-backed watchlists, in-app alerts with strict dedupe. Milestone 7
done: two more fixture-based source adapters (BSE India announcements +
PubMed abstracts) with cross-source trial-anchored dedupe, feeding the
same extraction/alerts/market-reaction pipelines — see `CHANGELOG.md`.
Milestone 8 done: production PWA readiness verified locally — legal pages,
in-app issue reporting with admin triage, security headers, backup/restore
scripts + runbook, deployment-options doc (no accounts created, nothing
deployed). Milestone 9 done: Expo mobile app verified locally — typed
API client, all 12 spec screens, cookie-session auth with zero API
changes, local-only push plumbing (no credentials configured). Milestone 10
done: store-readiness artifacts prepared locally — app icons/splash,
`POST /api/v1/push-tokens`, permission/privacy-label/screenshot/build/
crash-reporting/listing docs; nothing submitted, no accounts created. The
remaining launch work is all user-provided items — see
`docs/deployment.md` ("Store-submission checklist").
