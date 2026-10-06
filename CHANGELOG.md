# CHANGELOG

## [Unreleased]

- **Cloud Run deployment path** (2026-10-01): `apps/web/Dockerfile`
  (multi-stage pnpm build, non-root, honours `$PORT`), root `.dockerignore`,
  and `docs/deployment-cloud-run.md` — full runbook (Cloud Build, secrets,
  custom domain, Cloud Scheduler ingestion, billing guardrails, rollback).
  `docs/deployment.md` gains "Option D" summary. Nothing deployed; no GCP
  accounts created.
- Operator contact email set to `bio1941999@gmail.com` (2026-10-01):
  replaced the `contact@example.com` placeholder in `/privacy`, `/terms`,
  store listing docs, privacy-label docs, README and deployment checklist.

## [0.10.0] — 2026-10-01 — Milestone 10: store readiness (final milestone)

Hard constraint honored: everything below was prepared **locally**. No
store submissions, no developer accounts, no EAS/cloud builds, no
third-party crash reporting, no telemetry (`EXPO_TELEMETRY_DISABLED=1` on
every command), no secrets committed. The remaining launch work is entirely
user-provided — see `docs/deployment.md` ("Store-submission checklist").

### Added
- **App icons/splash** (`apps/mobile/assets/`, wired in `app.json`):
  `icon.png` 1024×1024 (App Store requirement), `adaptive-icon.png`
  1024×1024 foreground (mark inside the 66% safe zone; navy background via
  config), `splash.png` 1024×1024, `favicon.png` 48×48. Generated locally
  by the new zero-dependency `scripts/generate-mobile-icons.mjs`
  (pure-Node PNG writer; no external image services, no network).
- **`POST /api/v1/push-tokens`** (auth-required): device push-token
  registration storage — migration `009_push_tokens.sql` (`push_tokens`
  table, per-user unique, FK cascade on account deletion), Zod
  validation (`token` 1–500 chars, `platform` expo|apns|fcm), idempotent
  upsert, per-user isolation, token value never echoed in responses.
  Data-layer helpers `upsertPushToken`/`listPushTokens` in
  `@biocatalyst/data`. This is **registration only** — actual push fan-out
  (FCM/APNs credentials, delivery workers) is deliberately deferred.
- **`docs/store/`** — six store-readiness documents: `permissions.md`
  (notifications are the only runtime permission; exact in-app rationale
  copy; no camera/location/mic/contacts/calendar; Android manifest
  permissions documented from the expo-notifications library merge),
  `privacy-labels.md` (Apple App Privacy + Google Play Data safety
  answers grounded in actual behavior — account email and push token live
  only on the user's own server; no analytics/tracking/third-party SDKs;
  "verify before submission" flags), `screenshots.md` (shot list for
  iPhone 6.7"/6.5", iPad 13", Android phone + 7"/10" tablets, executable
  by the user later), `build.md` (prebuild flow, version/versionCode/
  buildNumber strategy, Android keystore commands with throwaway
  examples, iOS Xcode signing, user-provided items), `crash-reporting.md`
  (decision: no Sentry/Crashlytics per the no-third-party rule; what is
  lost; deferred self-hosted error-log endpoint design),
  `listing.md` (name, tagline, description, keywords, categories,
  age-rating guidance, URL/contact placeholders, 1.0.0 release-notes
  template).
- **Privacy policy** (`/privacy`): now discloses device push-token
  storage and retention. `contact@example.com` remains a placeholder.
- **Tests**: 15 new mobile jest assertions (`store-readiness.test.ts` —
  exact icon sizes from PNG headers, `app.json` wiring, permission
  audit, docs completeness) and 6 new web vitest tests for
  `POST /api/v1/push-tokens` (401 without session, 201 round-trip,
  idempotency, per-user isolation, Zod 400s, non-JSON 400).

### Changed
- Mobile Account screen: push section now shows the in-app permission
  rationale copy ("Enable push notifications to get alerted when
  companies, drugs, or trials you follow have new catalyst events…"),
  and status copy reflects that token registration is live while server
  delivery is still deferred.
- `apps/mobile/src/push/notifications.ts` header: endpoint now exists
  (M10); delivery still deferred.

### Deferred (documented, not built)
- Store submissions, developer accounts, real screenshots on devices.
- Push fan-out: FCM/APNs credentials, delivery workers, Expo projectId.
- Crash reporting: self-hosted error-log endpoint design recorded in
  `docs/store/crash-reporting.md`.
- In-app account deletion (Apple guideline 5.1.1(v) expects it where
  accounts can be created; current deletion path is the operator contact
  email — flagged in `docs/store/privacy-labels.md`).
- `android.versionCode` / `ios.buildNumber` pinned values for the 1.0.0
  release (strategy documented; values set at release time).

## [0.9.0] — 2026-10-01 — Milestone 9: Expo mobile app (local)

Hard constraint honored: everything below was done **locally**. No Expo
account, no EAS/cloud builds, no push credentials, no third-party network
contact from the app, no telemetry (`EXPO_TELEMETRY_DISABLED=1` on every
command). The app talks only to the user's own API base URL. No API or
auth changes were needed — web security posture is unchanged.

### Added
- **`packages/api-client` (`@biocatalyst/api-client`)**: typed fetch
  client over the unchanged `/api/v1/*` routes — auth (sign in/up/out,
  session), events, companies, drugs, trials, search, watchlist CRUD,
  alerts (list, mark read, mark all read), and a push-token stub. zod v4
  schemas validate every response with compile-time drift guards against
  the canonical `@biocatalyst/types`; transport/HTTP failures map to
  typed `ApiError` codes. Cookie-session support with zero backend
  changes: captures the raw `bc_session` token from the `Set-Cookie`
  response header after sign-in and re-attaches it as a `Cookie` header
  via an injected `TokenStorage` (expo-secure-store on mobile, in-memory
  default). 27/27 vitest tests.
- **`apps/mobile` (`@biocatalyst/mobile`)**: Expo SDK 53 (managed
  workflow, React Native 0.79.5) app. `expo export` verified locally —
  web, iOS and Android bundles build into `apps/mobile/dist/`. Design
  tokens mirror the web app (`navy #0f2a43`, `teal #0e7c7b`, …).
- **All 12 spec §4 screens**: Feed (event-type filter chips, cursor
  pagination, pull-to-refresh), Event detail (fact box, market-reaction
  window + data provider, sources list, confidence), Company / Drug /
  Trial detail pages, debounced grouped Search, Sign in / Sign up,
  Watchlist (unfollow), Alerts (mark read, mark all read), Account
  (push-permission toggle, API URL display). Anonymous browsing
  everywhere; watchlist and alerts auth-gated, matching the web app.
  Navigation: bottom tabs (Feed/Search/Watchlist/Alerts/Account) inside a
  native stack (detail + auth modal screens).
- **Push — local-only plumbing, not working push** (`src/push/`):
  `expo-notifications` requests permission, reads the *device* push token
  via `getDevicePushTokenAsync()` (purely native, no network), persists
  it in SecureStore, and POSTs it to `POST /api/v1/push-tokens` — which
  does not exist yet (Milestone 10), so a 404 is tolerated as
  `{ registered: false }`. `getExpoPushTokenAsync()` deliberately unused
  (contacts Expo's push servers, needs an Expo account/projectId).
  Real delivery needs the M10 backend endpoint + FCM/APNs credentials +
  a development/store build (Expo Go on SDK 53 cannot do remote push on
  Android). 6/6 plumbing tests.
- **Docs**: `apps/mobile/README.md` (setup, `EXPO_PUBLIC_API_URL`,
  web+mobile local run, push status + what the user must provide later),
  `packages/api-client/README.md`, `docs/decisions.md` (Expo choice,
  no-EAS rationale, thin-client + session-capture design, push approach),
  `docs/deployment.md` (mobile build options + push credential
  checklist), root README Milestone 9 section + repo map.

### Changed
- Root `pnpm.overrides` pins `@types/react` / `@types/react-dom` to
  `19.3.0` workspace-wide, and the mobile devDep was aligned to match:
  the mobile install had briefly introduced a second `@types/react`
  (19.0.14 via react-native's peer range), which leaked into
  `apps/web` typechecking (`TS2786`/`TS4023`) and broke `next build`.
  Lesson recorded in `docs/decisions.md`.
- `apps/web/src/lib/security-headers.test.ts`: one-line type fix
  (`config.headers` is optional in the `NextConfig` JSDoc type; assert
  defined before invoking). Pre-existing M8 issue, test-only, no runtime
  change.

### Verification
- `pnpm test`: 19/19 turbo tasks green — 254 tests total (238 existing +
  16 new mobile). `pnpm build`: 11/11 (incl. web `next build` and mobile
  `expo export`). `pnpm typecheck`: 20/20. `pnpm lint`: 11/11.
- `EXPO_TELEMETRY_DISABLED=1 pnpm --filter @biocatalyst/mobile build`
  exports web (1.55 MB JS), iOS (3.27 MB .hbc) and Android (3.29 MB .hbc)
  bundles with no errors.


## [0.8.0] — 2026-10-01 — Milestone 8: production PWA readiness (local)

Hard constraint honored: everything below was done **locally**. No accounts
created, no deploys executed, no third-party monitoring/analytics integrated.
`docs/deployment.md` documents the options and exactly what the user must
provide for a real deployment.

### Added
- **Legal pages** (spec §21, required before launch): `/privacy`, `/terms`,
  `/disclaimer` — informational-only (not medical advice, not investment
  advice), data sources & fixture status, data retention, contact
  (`contact@example.com` placeholder — a real operator address is required
  before public launch). Linked from the site footer.
- **Data-correction / issue-reporting mechanism** (spec §21, §4.2): the event
  detail "Data quality" panel now has an inline **Report an issue** form
  (`IssueReportForm`, client component) posting to new
  `POST /api/v1/issues` — Zod-validated (UUID event_id, category enum,
  10–2000 char description, optional contact), anonymous, stored in-app in
  the new `issue_reports` table (migration
  `packages/db/migrations/008_issue_reports.sql`), zero third-party form
  services. `GET /api/v1/admin/issues` lists reports newest-first behind
  the existing `isAdminRequest` gate; a minimal admin view at
  `/admin/issues` reuses that gating (admin pastes their token in the
  browser; the token never ships in page HTML).
- **PWA hardening**: service worker rewritten (`apps/web/public/sw.js`) —
  cache-first for static assets, network-first navigations with cached
  fallback, and a new `/offline` fallback page served when the device is
  offline. Manifest already met installability criteria (name, icons
  192/512 incl. maskable, theme_color, start_url, display standalone,
  description); icon PNGs verified at exact 192×192 / 512×512. No
  Lighthouse/Chrome available locally — criteria verified manually and
  documented here.
- **Security headers** in `apps/web/next.config.mjs`
  (`SECURITY_HEADERS`, exported for tests): `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: SAMEORIGIN`, and a same-origin-only CSP with
  `frame-ancestors 'self'` (zero third-party origins allowed — the app
  loads no external scripts, fonts, images or beacons).
- **Backup/restore** (spec §20): `scripts/db-backup.sh` (pg_dump `-Fc` +
  env-file copies into timestamped dirs, retention pruning, `--dry-run` /
  `--help`) and `scripts/db-restore.sh` (restores into a fresh
  `<db>_restore_verify` database by default — never clobbers live — then
  runs verification queries). `docs/runbook.md` gains a "Backup & restore"
  section: what to back up (DB + .env + uploads-if-any), restore
  verification steps, recovery-time notes (RTO < 15 min target, daily
  backup cadence suggestion). `backups/` added to `.gitignore`.
- **Deployment options** (`docs/deployment.md`, new): Cloudflare
  Pages/Workers, Vercel, and self-hosted VPS (Docker + Caddy) compared with
  monthly cost assumptions (₹0 free tiers vs ~₹350–550/mo VPS + domain),
  per-option lists of exactly what the user must provide (accounts, domain
  registrar, DNS, env secrets), billing safeguards (alerts, spend caps,
  kill-switches), and a self-hosted monitoring recipe — cron hitting
  `/api/v1/admin/health` + log file, `ingestion_runs` as source of truth.
  Explicitly notes Sentry/analytics are NOT integrated per the no-tracking
  rule.

### Tests
- New: legal-page render tests (200-equivalent + key disclaimer copy),
  issue-report API tests (validation 400s, 201 storage round-trip, unknown
  event → 400 not 500, admin list gating 403 / newest-first 200),
  security-headers config tests, backup/restore script tests (`--help` +
  `--dry-run`), no-external-requests scan of built HTML.
- Full suite green; production build + `next start` smoke-tested
  (feed, event detail, search, legal pages, auth-gated watchlist, admin
  issues page, issue reporting end-to-end, security headers present).

## [0.7.0] — 2026-09-30 — Milestone 7: additional sources (BSE India + PubMed)

### Added
- **BSE India adapter** (`packages/ingestion/src/adapters/bse.ts`,
  `sourceName: "bse-fixture"`): fixture-based mock of BSE corporate
  announcements — 5 fictional records
  (`packages/ingestion/src/adapters/fixtures/bse/`) covering regulatory
  approval, licensing/partnership, acquisition/divestiture, a clinical
  trial result, and a regulatory submission. Category→taxonomy mapping is
  explicit; unmappable categories and unusable dates → `null`, rejected
  (never guessed). Licensing partners and acquisition targets are
  **text-only mentions**, never entity links.
- **PubMed adapter** (`packages/ingestion/src/adapters/pubmed.ts`,
  `sourceName: "pubmed-fixture"`): fixture-based mock of PubMed
  abstracts — 3 fictional records
  (`packages/ingestion/src/adapters/fixtures/pubmed/`), all
  `scientific_publication`, outcome always `null`.
- **Adapter registry** (`packages/ingestion/src/registry.ts`):
  `ADAPTER_FACTORIES` (run order: `ctri`, `bse`, `pubmed`),
  `listSourceNames()`, `createAdapter()`, `runAllIngestion()`.
- **Cross-source dedupe**: trial-anchored `crossSourceKey`
  (`packages/ingestion/src/normalize.ts`), stored on
  `events.cross_source_key` (migration
  `packages/db/migrations/007_cross_source_key.sql`, partial unique
  index with NULLs exempt). When two sources report the same trial, the
  second **merges** into the first's event (source + entities linked,
  first writer's headline/type stand, `eventsMerged` metric, no new
  alert).
- **CLI/API**: `pnpm ingest` runs all adapters (JSON array of per-source
  metrics); `pnpm ingest --source <name>` runs one (unknown → exit 2
  with the known list). `POST /api/v1/admin/ingestion/run` runs all;
  `?source=<name>` runs one (unknown → 400 with `knownSources`).
  `GET /api/v1/admin/health` now reports `milestone: 7` and per-source
  health for all three adapters.
- Both new sources feed the same M4/M5/M6 pipelines: deterministic
  extraction → review gate → watchlist alerts → §9 market reactions.

### Tests
- 191 passing (was 164): +18 pure unit tests for the two new adapters
  (mapping, text-only counterparties, unmappable-category rejection,
  cross-source key sharing) and +9 integration tests (cross-source merge
  of the real fixture pair into ONE event with both sources linked,
  multi-adapter `runAllIngestion` + idempotent re-run, per-source
  health, provenance, alert fan-out for a new-source event, market
  reactions incl. the Mankind missing-data path).

## [0.6.0] — 2026-10-01 — Milestone 6: auth + watchlists + in-app alerts

### Added
- **Auth package** (`@biocatalyst/auth`, fully local): pluggable
  `AuthProvider` interface (`signUp`/`signIn`/`signOut`/`verifyToken`) with a
  default local implementation — scrypt password hashing (Node built-in,
  N=16384/r=8/p=1, random 16-byte salts), `crypto.randomBytes` session
  tokens stored as SHA-256 hashes in Postgres (migration
  `006_auth.sql`: `users` gains `email`/`password_hash`/`display_name`,
  new `sessions` table, `alerts.read_at`). No Supabase Auth, no OAuth, no
  third-party providers, no external network contact (rationale in
  `docs/decisions.md`).
- **Notifications package** (`@biocatalyst/notifications`): in-app channel
  only (M6; email/push are later milestones). `generateAlertsForEvent(eventId)`
  creates one alert per watcher of the event's linked companies/drugs, but
  only for `review_status = 'published'` events (the M4 confidence gate
  already encodes high confidence ≥ 0.85). Dedupe is structural:
  `UNIQUE (user_id, event_id, channel)` + `ON CONFLICT DO NOTHING` — re-ingests,
  retries and parallel runs can never duplicate. Includes
  `listAlerts`/`getUnreadCount`/`markAlertRead`/`markAllAlertsRead`.
- **Ingestion hook**: the runner calls `generateAlertsForEvent` after every
  newly published event (idempotent, outside the store transaction) and
  reports `alertsCreated` in the run metrics; `pnpm ingest` and the admin
  ingestion endpoint both flow through it.
- **Web API** (spec §12): `POST /api/v1/auth/signup` (201, auto-sign-in),
  `POST /api/v1/auth/signin`, `POST /api/v1/auth/signout`,
  `GET /api/v1/auth/session`, `GET`/`POST /api/v1/watchlist` (idempotent
  follow: 201 new, 200 already-followed, 404 unknown entity),
  `DELETE /api/v1/watchlist/{entity_type}/{entity_id}` (204, idempotent),
  `GET /api/v1/alerts` (`{ items, unreadCount }`, event headline + link per
  alert), `POST /api/v1/alerts/{id}/read`, `POST /api/v1/alerts/read-all`.
  All Zod-validated; watchlist/alerts are 401 for anonymous callers.
- **Web UI**: `/signup` and `/signin` pages (minimal, clean), server-backed
  watchlist page (auth-gated with a sign-in prompt for anonymous visitors),
  notification center at `/alerts` (unread badges, mark-read per alert and
  mark-all), Follow buttons on company/drug pages (signed-out visitors see
  "Sign in to follow"), and a header bell with the live unread-count badge.
  The M1 localStorage watchlist mock is fully replaced.
- **Security**: `/api/v1/auth/*` rate-limited to 20 req/min per IP (vs 120
  elsewhere), both with `Retry-After`; httpOnly + SameSite=Lax session
  cookies (`Secure` in production); passwords/tokens never logged and never
  in API responses; identical 401s for unknown email vs wrong password (no
  account enumeration); `AUTH_SESSION_TTL_DAYS` env (default 30).

### Changed
- Anonymous browsing is unchanged: feed, event/company/drug/trial pages and
  search stay public without login; auth gates only watchlists and alerts.
- Unfollowing is instant and stops new alerts for that entity (alert
  generation reads the live watchlist at ingest time — spec §17).
- `pnpm db:setup` creates three more isolated test databases
  (`biocatalyst_auth_test`, `biocatalyst_notifications_test`,
  `biocatalyst_web_test`); each DB-backed suite uses its own so parallel
  `turbo run test` can't interfere.

### Tests
- 164/164 green (was 137): +11 auth (signup/login/logout, session
  persistence across instances, expiry + cleanup, duplicate/invalid input,
  no plaintext storage), +6 notifications (alert on published event,
  idempotent re-ingest → one alert, unfollow → no new alerts per §17,
  pending_review silence, multi-entity single alert, read state),
  +10 web (auth flow, watchlist follow/unfollow + validation + 401s, alerts
  401, stricter auth rate limits, anonymous public events API 200).
- Dev smoke check: signed up, followed Biocon Ltd, `pnpm ingest` → 1 alert
  in `/alerts`; re-ingest → still 1 (dedupe); unfollow → re-ingest creates 0
  alerts; anonymous feed/event/search pages 200, auth endpoints 401.

## [0.5.0] — 2026-10-01 — Milestone 5: market-data adapter + market-reaction calculations

### Added
- **Market-data package** (`@biocatalyst/market-data`, fully offline): the
  price provider is always behind the `MarketDataProvider` interface
  (`getPrices(security, from, to): Promise<PriceBar[]>`, optional
  `getBenchmarkPrices`), selected by `MARKET_DATA_PROVIDER` (`fixture`
  default — offline fixture series, no network, no API keys). A future
  licensed provider implements the same interface with no caller changes;
  unknown values warn and fall back to `fixture`. No real price API is
  wired, requested, or required — rationale (keys, licenses, offline-first)
  in `docs/decisions.md`.
- **Spec §9 calculation** (`calculate.ts`, implemented exactly):
  `price_before` = latest close before the event window; `price_after` =
  selected close after; `pct_change = (price_after/price_before − 1) × 100`;
  `benchmark_change` = same for the benchmark; `relative_change =
  pct_change − benchmark_change`. Missing data is stored as NULL — never
  fabricated or interpolated; benchmark fields are omitted (null) when
  benchmark data is unavailable for the window.
- **Exact measurement windows**: always stored (`window_definition`,
  `window_start`, `window_end`) and displayed verbatim, e.g. "NSE close on
  2026-09-28 → NSE close on 2026-09-29 (announcement 2026-09-29 08:15 IST —
  before market open)"; date-only events get a clearly labeled daily
  window. Provider name + license/usage metadata stored on every
  `market_reactions` row (migration `005_market_reaction_nullable.sql`,
  which also makes the price columns nullable).
- **Benchmark support**: synthetic NIFTY-Pharma-like fixture index, always
  labeled `"NIFTY Pharma (fixture)"` — not the real index.
- **`pnpm market:reaction` CLI**: computes/backfills §9 reactions for
  published events with a known event time (seeded + ingested), upserting
  on `(event_id, security_id)` — idempotent, never duplicates rows. Also
  runs as part of `pnpm db:seed`; bars measured from are persisted to
  `market_prices` with the provider name.
- **Seed changes**: `seed.ts` no longer hand-writes market reactions —
  they are computed from the fixture price series by the pipeline.
  MANKIND deliberately has no fixture prices: its events permanently
  exercise the missing-data path (no row fabricated).

### Changed
- `MarketReaction` type: `priceBefore`/`priceAfter`/`pctChange` nullable;
  adds `windowStart`/`windowEnd`/`licenseMetadata`. Event-detail panel and
  feed card render nulls as "Not available"; panel adds the license note.
  Copy stays non-causal ("market reaction around the event").
- Isolated `biocatalyst_market_test` database for the market-data test
  suite (same pattern as ingestion/extraction); `scripts/db-setup.sh`
  creates it.

### Tests
- 25 new market-data tests: hand-verified §9 math, window edge cases
  (before-open / during-hours / after-close / weekend / missing
  before/after → nulls / daily window / empty bars), benchmark-relative
  math, fixture provider behavior + `MARKET_DATA_PROVIDER` selection,
  DB-backed idempotent recompute + missing-data canary. 3 new web tests:
  panel shows exact window + provider + benchmark-relative values, nulls
  render safely, and no causation language in the copy. Full suite:
  137/137 green; `pnpm build --force` clean (7/7).

## [0.4.0] — 2026-10-01 — Milestone 4: AI extraction pipeline

### Added
- **Extraction package** (`@biocatalyst/extraction`, fully offline): the
  model provider is always behind the `ExtractionProvider` interface
  (`extract(document): Promise<StructuredExtraction>`), selected by
  `MODEL_PROVIDER` (`deterministic` default, `mock` for fixture "model"
  behavior). The default `DeterministicExtractor` is rule/template-based
  (regex + record-field rules, no network, no API keys); `MockModelProvider`
  returns canned structured outputs to exercise model-like paths. No real
  third-party model API is wired, requested, or required — rationale
  (cost, keys, offline-first) in `docs/decisions.md`.
- **§8.2 extraction schema** as Zod-validated TypeScript types
  (`event_type` closed taxonomy, company/drug/trial/indication names,
  `ticker_candidates`, `phase`, `outcome`, `facts[]`
  `{claim, source_span, confidence}`, `published_at`, `confidence`).
  Invalid payloads are rejected and trigger deterministic fallback.
- **Guardrails** (spec §8.3, hard requirements): never invents numeric
  values, trial IDs, endpoints, dates, or company relationships
  (missing → null/empty); ambiguous outcome language → `outcome:
  "unknown"` with lowered confidence; every fact carries a verbatim
  `source_span`; `primary_endpoint_met/missed` below 0.85 confidence →
  `review_status='pending_review'`, never auto-published.
- **Content-hash caching** (spec §8.1): `extractions` table keyed on
  `(document_hash, provider, prompt_version, schema_version)` — a document
  is never re-extracted under the same versions (migration
  `004_extraction.sql`; `events.extraction_id` links events to rows).
- **Prompt/schema versioning**: `PROMPT_VERSION="m4-v1"` and
  `EXTRACTION_SCHEMA_VERSION="1.0.0"` persisted on every extraction row;
  bumping either forces re-extraction.
- **Deterministic fallback** (spec §17): provider errors or invalid JSON
  resolve to template extraction, confidence capped at 0.5,
  `fallback_used=true`, `review_status='pending_review'` — the pipeline
  never crashes.
- **Template summaries**: `factual_summary` (80–150 words, built only from
  extracted facts) and `catalyst_summary` (neutral operational relevance,
  no investment language — spec §6, enforced by a banned-phrase guard).
- **Ingestion wiring**: `runIngestion` now runs extract → validate →
  confidence rules → store extraction after normalize/entity-resolution,
  writing the event with the extraction's summaries, effective confidence,
  review status, and `extraction_id`. M3 dedupe/provenance unchanged;
  run metrics add `extractionProvider`, `promptVersion`, `schemaVersion`,
  `extractionsCached`.
- **Review queue**: data-layer `listPendingReview(limit)` (lowest
  confidence first, with extraction provenance), embedded in
  `GET /api/v1/admin/health` as `reviewQueue`, plus
  `GET /api/v1/admin/review-queue`. No review UI yet (later milestone).
- **Tests**: 47 new extraction tests (schema valid/invalid, guardrails,
  cache, versioning, fallback, summary word-count + investment-language
  ban, provider selection) + runner-level M4 tests (ambiguous outcome →
  pending_review, extraction-driven review_status consistency) + a
  data-layer review-queue test. Total suite: 109 passing.

### Changed
- `review_status` on ingested events is now extraction-driven
  (confidence ≥ 0.85 → `published`, else `pending_review`) instead of
  always `pending_review`; the M3 test asserting the old default was
  updated to assert events↔extractions consistency. Public API behavior
  unchanged (the feed never filtered on `review_status`).
- `.env.example`: documented `MODEL_PROVIDER`; removed the
  `MODEL_API_KEY` placeholder (nothing in the build needs one).

## [0.3.0] — 2026-10-01 — Milestone 3: one real source (fixture-based CTRI adapter)

### Added
- **Ingestion package** (`@biocatalyst/ingestion`): `SourceAdapter`
  interface (`sourceName`, `fetchSince(cursor)`, `normalize(doc)`,
  `getNextCursor()`) plus a `runIngestion()` pipeline — content-hash and
  event-fingerprint dedupe (canonical URL + content hash + fingerprint),
  raw-snapshot archiving, per-run metrics, cursor persistence. Makes zero
  network requests.
- **`CtriFixtureAdapter`** (`sourceName: "ctri-fixture"`): fixture-based mock
  of a Clinical Trials Registry – India public-record adapter. Five
  hand-curated fixture records
  (`packages/ingestion/src/adapters/fixtures/ctri/*.json`, CTRI-style
  `last_updated`, phase, status, sponsor fields) normalize via deterministic
  templates (unknown statuses/phases → `null`, never guessed). Fixture
  approach per spec §7 ("implement an adapter interface and fixture-based
  mock rather than bypassing access controls"); rationale in
  `docs/decisions.md`.
- **Migration `003_ingestion.sql`**: `raw_snapshots` (archived source
  documents + content hash), `ingestion_runs` (per-run metrics:
  docs_fetched/changed, events_created/rejected, newest source timestamp,
  error), `ingestion_cursors` (resume cursor per source).
- **Admin endpoints** (spec §12): `GET /api/v1/admin/health` (DB status +
  per-source health: last run status/metrics, newest source timestamp,
  cursor) and `POST /api/v1/admin/ingestion/run` (triggers one ingestion
  pass, returns run metrics). Both token/dev-gated: allowed when
  `NODE_ENV=development`, otherwise require
  `Authorization: Bearer <ADMIN_TOKEN>` (timing-safe compare).
- **CLI**: `pnpm ingest` runs one ingestion pass (migrations first,
  idempotent) and prints run metrics as JSON.
- **Tests**: 24 ingestion tests (`adapter.test.ts`: normalization,
  fingerprint/content-hash dedupe, cursor logic; `run.test.ts`:
  end-to-end pipeline against isolated `biocatalyst_ingestion_test` DB) +
  4 admin-gate tests. Total suite: 59 tests passing.

### Fixed
- `pnpm ingest` printed pnpm help instead of running: the ingestion
  package's script was named `run`, which `pnpm --filter <pkg> run`
  interprets as the `pnpm run` subcommand. Renamed to `ingest`; root
  script is now `pnpm --filter @biocatalyst/ingestion ingest`.

### Changed
- Web build fixed for the `seedDatabase` import refactor: tests now import
  from the `@biocatalyst/data/seed-db` subpath export (web tsconfig maps
  the package to source, where `.js`-suffixed relative imports break
  webpack). Full fresh `pnpm build` verified green.

## [0.2.0] — 2026-10-01 — Milestone 2: canonical Postgres backend

### Added
- **Postgres schema** (`packages/db/migrations/001_init.sql`): all spec §5
  tables, UUID primary keys, `legacy_id` traceability columns, provenance
  columns (NOT NULL source URL + timestamps), trigram GIN indexes.
  Plain-SQL migrations via a tiny TS runner (`@biocatalyst/db`); no ORM.
- **DB-backed data layer**: `@biocatalyst/data` keeps every function
  name/parameter from M1 but is now async over PostgreSQL (via `pg`).
  Added `getCompanyById` / `getDrugById` / `getTrialById` and
  `seedDatabase()` + `seed:db` CLI (idempotent TRUNCATE + reload from the
  M1 fixtures). `pnpm db:setup` creates the local role/databases,
  migrates, and seeds; `pnpm db:reset` wipes clean.
- **API hardening**: Zod runtime validation on every `/api/v1/*` route
  (400s, never 500s on bad input); fixed-window per-IP rate limiting
  (120 req/min, 429 + Retry-After) via `apps/web/src/middleware.ts`;
  new `GET /api/v1/resolve` for the client-side watchlist.
- **Tests**: 19 DB integration tests (`db.test.ts`) against
  `biocatalyst_test` — seed volumes, provenance, pagination, all filters,
  unknown-cursor semantics, trigram search resolution, entity linkage,
  market-reaction math; plus 4 Zod validation tests.

### Changed
- `eventTypeLabel` moved to `@biocatalyst/types` (pure, client-safe);
  `@biocatalyst/data` re-exports it. Client components no longer import
  the DB-backed package (keeps `pg` out of the browser bundle).
- Local dev now needs Postgres: `sudo apt install postgresql`, then
  `pnpm db:setup` (Ubuntu archives only — no third-party apt sources).
  See README "Database".

## [0.1.1] — 2026-10-01 — Verification + trial-link fix

### Fixed
- Trial links 404'd: pages built `/trials/{registry}/{registryTrialId}` with
  the raw registry ID, but CTRI IDs contain slashes
  (e.g. `CTRI/2024/08/071902`), producing extra path segments and a
  duplicated registry. Added `trialUrl()` helper
  (`apps/web/src/lib/urls.ts`) that percent-encodes the trial ID; updated
  all 4 link sites (event, company, drug, search pages). Page + API routes
  already decoded via `decodeURIComponent`, so no route changes needed.
- Added 3 Vitest cases for `trialUrl` (encoding, decode round-trip,
  slash-free IDs).

### Verified
- `pnpm test`: 28/28 passing (20 seed-integrity + 8 web utils).
- `pnpm build`: clean (3/3 turbo tasks).
- `pnpm dev` smoke check: homepage 200 with feed cards, event detail 200
  (fact box, market reaction, sources), company/drug/trial pages 200,
  search page + API 200, watchlist 200, events API pagination + filters OK.

## [0.1.0] — 2026-09-30 — Milestone 0 + Milestone 1

### Milestone 0 — Bootstrap
- pnpm + Turborepo monorepo (`apps/web`, `packages/types`, `packages/data`).
- TypeScript strict config, shared base tsconfig, `.env.example` (spec §19
  placeholders, no secrets committed).
- Docs: `decisions.md`, `architecture.md`, `data-sources.md`, `runbook.md`.
- `README.md` with exact local setup commands; one-command flow:
  `pnpm install && pnpm build && pnpm test && pnpm dev`.

### Milestone 1 — Static web prototype (seeded)
- Responsive Next.js 15 + TypeScript PWA (manifest, service worker,
  generated 192/512px icons), light navy/teal theme.
- Seeded data: 10 companies, 20 drugs, 20 trials, 30 catalyst events —
  every event has ≥1 source with URL + published/retrieved timestamps;
  26 events carry seeded market reactions with explicit window definitions.
- Screens: Catalyst Feed (newest-first + event-type filter chips), Event
  Detail (fact box, 80–150-word-style summary, neutral "why this matters",
  market-reaction panel with window + provider, sources, data-quality),
  Company / Drug / Trial pages, universal Search (name/ticker/alias/trial
  ID/indication), Watchlist UI (localStorage mock, no auth).
- Typed API (spec §12 subset): events (cursor pagination + filters),
  event detail, company (+ events), drug, trial, search, healthz.
- Tests: 20 Vitest assertions across seed integrity (acceptance criteria),
  pagination, search, and formatting utils. All passing.
