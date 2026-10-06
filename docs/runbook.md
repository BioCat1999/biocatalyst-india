# Runbook — local development

## One-command sequence (spec §16: startable locally, one documented flow)

```bash
pnpm install     # install all workspace dependencies
pnpm db:setup    # create local Postgres role/DBs, migrate, load seed fixtures
pnpm build       # typecheck + build all packages
pnpm test        # run all unit/integration tests (incl. DB-backed tests)
pnpm dev         # start the web app → http://localhost:3000
```

`pnpm dev` runs only `@biocatalyst/web` (Turborepo filter). The feed,
entity pages, search and `/api/v1/*` are served from local Postgres
(see "Database" in README) — no API keys, no paid services, no network
calls required (ingestion is fixture-backed in M3).

## Ingestion (M3, multi-source since M7)

Run one ingestion pass of **all registered adapters** against
`DATABASE_URL` (migrations applied first, idempotent — re-runs create 0
new events):

```bash
pnpm ingest
# prints per-source run metrics as a JSON array:
# [{"sourceName":"ctri-fixture","status":"success","docsFetched":0,...},
#  {"sourceName":"bse-fixture","status":"success","docsFetched":5,
#   "docsChanged":5,"eventsCreated":5,"eventsMerged":0,...},
#  {"sourceName":"pubmed-fixture","status":"success","docsFetched":3,
#   "docsChanged":3,"eventsCreated":2,"eventsMerged":1,...}]

pnpm ingest --source bse-fixture   # one adapter only
pnpm ingest --source no-such-source # exit 2; prints the known source list
```

Registered sources (in run order): `ctri-fixture` (M3), `bse-fixture`
(M7, BSE corporate-announcement mock), `pubmed-fixture` (M7, PubMed
abstract mock). When two adapters report the same trial, the second
**merges** into the first's event (`eventsMerged`) instead of creating a
duplicate; no new alert is raised for a merge.

Via the admin API (with the dev server running):

```bash
curl localhost:3000/api/v1/admin/health      # DB status + per-source metrics + reviewQueue
curl localhost:3000/api/v1/admin/review-queue # pending_review items, lowest confidence first (?limit=)
curl -X POST localhost:3000/api/v1/admin/ingestion/run                      # all sources
curl -X POST "localhost:3000/api/v1/admin/ingestion/run?source=bse-fixture" # one source
# unknown source → 400 with {"error":"unknown source: <name>","knownSources":[...]}
```

## AI extraction (M4)

Every ingested document is extracted into the §8.2 structured schema
(Zod-validated), cached by content hash, and assigned a review status by
confidence-threshold rules (spec §8.3). The pipeline is fully offline.

### `MODEL_PROVIDER`

```bash
MODEL_PROVIDER=deterministic   # default: rule/template extractor, no network, no keys
MODEL_PROVIDER=mock            # fixture "model" with canned outputs (exercises guardrail paths)
```

Any other value warns and falls back to `deterministic`. No real
third-party model API is wired — see `docs/decisions.md` ("M4 — No real
model API"). There is deliberately no `MODEL_API_KEY`: nothing in the
build needs one.

### Review queue

Events with `review_status = 'pending_review'` (confidence < 0.85, or
deterministic-fallback extractions) await manual review:

```bash
curl localhost:3000/api/v1/admin/review-queue?limit=20
```

Each item carries extraction provenance: provider, `prompt_version`,
`schema_version`, and `fallback_used`. `GET /api/v1/admin/health` also
embeds `reviewQueue: { pendingCount, items }` (top 10, lowest confidence
first). No review UI yet (later milestone); the queue is queryable via
the admin API and the data-layer `listPendingReview(limit)` function.

### Admin gating (`ADMIN_TOKEN`)

`POST /api/v1/admin/ingestion/run` must never be open in production. It is
allowed when `NODE_ENV=development` (i.e. `pnpm dev`) with no token.
Outside development it requires a bearer token matching the server env
var:

```bash
# apps/web/.env (never commit real values — spec §19)
ADMIN_TOKEN=<redacted>
```

```bash
curl -X POST localhost:3000/api/v1/admin/ingestion/run \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

The token is compared timing-safely server-side and never appears in
responses. `GET /api/v1/admin/health` is similarly gated.


## Market reaction (M5)

Compute §9 market reactions for published events with a known event time and
upsert them into `market_reactions` (idempotent — re-runs refresh rows, never
duplicate them). Runs automatically as part of `pnpm db:seed`; run it again
after `pnpm ingest` to backfill newly ingested events:

```bash
pnpm market:reaction
# prints run metrics as JSON:
# {"provider":"fixture","eventsScanned":35,"reactionsUpserted":33,
#  "reactionsWithNullPrices":0,"securitiesWithoutData":2,
#  "windowsUnformable":0,"errors":[]}
```

Provider selection (fully offline, no API keys — see `docs/decisions.md`):

```bash
MARKET_DATA_PROVIDER=fixture pnpm market:reaction   # default: fixture prices
MARKET_DATA_PROVIDER=bogus pnpm market:reaction     # warns, falls back to fixture
```

Notes:

- The event-detail page shows the exact measurement window, provider name,
  license note, and benchmark-relative values when present. Copy is
  non-causal ("market reaction around the event", never "caused by").
- Missing prices are stored as NULLs — never fabricated or interpolated.
  Securities with no fixture data (e.g. MANKIND) get no reaction row.
- The fixture benchmark is a synthetic NIFTY-Pharma-like index, always
  labeled `"NIFTY Pharma (fixture)"` — not the real index.

## Auth, watchlists & in-app alerts (M6)

Sign-up/sign-in pages at `/signup` and `/signin`; the session token is an
httpOnly, SameSite=Lax cookie (`bc_session`, `Secure` in production).
Anonymous browsing keeps working — only watchlist/alert endpoints require
auth (401 otherwise).

```bash
# sign up (sets the session cookie; auto-signed-in)
curl -c jar.txt -X POST localhost:3000/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"choose-a-long-password"}'
# follow a company (201; idempotent — 200 when already followed)
curl -b jar.txt localhost:3000/api/v1/auth/session   # who am I? (401 when anonymous)
COMPANY_ID=$(psql "$DATABASE_URL" -tAc "SELECT id FROM companies WHERE canonical_name='Biocon Ltd'")
curl -b jar.txt -X POST localhost:3000/api/v1/watchlist \
  -H 'Content-Type: application/json' \
  -d "{\"entity_type\":\"company\",\"entity_id\":\"$COMPANY_ID\"}"
# list follows / unfollow / notification center
curl -b jar.txt localhost:3000/api/v1/watchlist
curl -b jar.txt -X DELETE localhost:3000/api/v1/watchlist/company/$COMPANY_ID   # 204, stops future alerts instantly
curl -b jar.txt localhost:3000/api/v1/alerts            # { items, unreadCount }
curl -b jar.txt -X POST localhost:3000/api/v1/alerts/read-all
curl -b jar.txt -X POST localhost:3000/api/v1/auth/signout
```

When a new **published** (high-confidence) event is ingested for a followed
company/drug, `generateAlertsForEvent(eventId)` creates one in-app alert
per follower — strictly deduped by `(event_id, user_id, channel)`, so
re-ingests and retries never duplicate. The ingestion CLI/runner calls it
after every newly published event and reports `alertsCreated` in the run
metrics. Bell icon in the header shows the unread count; `/alerts` is the
notification center (mark read per-alert or mark-all).

### Auth env vars & session notes

| Var | Default | Notes |
|---|---|---|
| `AUTH_SESSION_TTL_DAYS` | `30` | session cookie + DB expiry lifetime |
| (none) | — | no auth secrets needed: passwords are scrypt-hashed in Postgres; there is deliberately no `AUTH_*_KEY` — no third-party provider is used |

- Rate limits: `/api/v1/*` is 120 req/min per IP; `/api/v1/auth/*` is
  **20 req/min per IP** (brute-force protection), both with `Retry-After`.
- Passwords/tokens are never logged; API responses never contain hashes.
- Sessions are DB rows: deleting a row signs the user out everywhere;
  expired sessions are rejected and cleaned up on next use.
- `pnpm db:setup` also creates the isolated test DBs
  (`biocatalyst_auth_test`, `biocatalyst_notifications_test`,
  `biocatalyst_web_test`) used by the M6 suites.

## Useful commands

| Command | What it does |
|---|---|
| `pnpm db:setup` | create role + databases, run migrations, load seed fixtures |
| `pnpm db:migrate` | apply pending migrations only |
| `pnpm db:seed` | (re)load seed fixtures into the dev database |
| `pnpm db:reset` | drop, recreate, migrate, reseed — clean slate |
| `pnpm ingest` | run one fixture ingestion pass (see above) |
| `pnpm market:reaction` | compute §9 market reactions (idempotent backfill) |
| `pnpm --filter @biocatalyst/web dev --port 3001` | web on another port |
| `pnpm --filter @biocatalyst/data test` | data package tests only |
| `pnpm typecheck` | typecheck all workspaces |
| `node scripts/generate-icons.mjs` | regenerate PWA icons |
| `curl localhost:3000/api/healthz` | health check |
| `curl 'localhost:3000/api/v1/events?limit=5'` | feed API smoke test |

## Troubleshooting

- **Port in use**: `pnpm --filter @biocatalyst/web dev -- --port 3001`
  (Next 15 forwards extra args after `--`).
- **Stale build**: `rm -rf apps/web/.next && pnpm build`.
- **pnpm missing**: `npm install -g pnpm@10` (repo pins `packageManager`).
- **Node version**: requires Node ≥ 20 (engines field).
- **Postgres not running**: `sudo pg_ctlcluster 16 main start`
  (needed after a VM reboot).
- **`DATABASE_URL is not set`**: the CLI (`pnpm ingest`, `pnpm db:*`) reads
  the env var directly — Next.js loads `apps/web/.env`, plain Node CLIs
  do not. Export it:
  `export DATABASE_URL=postgresql://biocatalyst:biocatalyst@localhost:5432/biocatalyst_dev`
  (see `.env.example`).

## Backup & restore (M8, spec §20)

Postgres holds everything the product cannot regenerate cheaply: the
canonical entity graph, events, sources, ingestion run history, user
accounts, watchlists, alerts, and issue reports. Back it up on a schedule;
practice the restore so it works when it matters.

### What to back up
1. **The database** — `pg_dump -Fc` (custom format) of `biocatalyst_dev`
   (and any production database). Custom format is compressed and restorable
   selectively with `pg_restore`.
2. **Env files** — `.env`, `apps/web/.env*` (DATABASE_URL, ADMIN_TOKEN, …).
   `db-backup.sh` copies them next to the dump automatically. They contain
   secrets: `backups/` is git-ignored and must never leave the operator's
   control (encrypted volume / secrets manager in production).
3. **Uploads** — none in MVP (no user uploads exist). If file uploads are
   added later, their object store must join the backup set.

### Commands
```bash
# One backup now (timestamped dir under ./backups/, keeps newest 14):
bash scripts/db-backup.sh
# Options: --db biocatalyst_dev --out backups --keep 14 --dry-run --help

# Restore + verify into a FRESH database (never clobbers live by default):
bash scripts/db-restore.sh --backup backups/biocatalyst_<TS>
# Disaster-recovery restore into a named DB (drops it first — dangerous):
bash scripts/db-restore.sh --backup backups/biocatalyst_<TS> \
  --target-db biocatalyst_dev --drop
```

### Restore verification steps (run after every restore)
`db-restore.sh` runs these automatically; repeat by hand to be sure:
```bash
psql "$DATABASE_URL" -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;"
# → must show the latest migration (currently 008_issue_reports)
psql "$DATABASE_URL" -c "SELECT count(*) FROM events; SELECT count(*) FROM companies; SELECT count(*) FROM sources;"
# → non-zero, plausible counts (dev seed: ~35 events, 10 companies)
```
Then start the app against the restored DB and smoke-check `/`,
`/api/v1/events?limit=5`, and one event page.

### Recovery time notes
- Dump of the dev-seed database is a few hundred KB: dump ≈ seconds,
  restore + verification ≈ under a minute.
- Recovery-time objective for MVP: **< 15 minutes** from “DB lost” to “app
  serving from last backup” on the same host (dominated by provisioning, not
  by the dump size). Re-measure once the database grows past 1 GB.
- Recovery-point objective: whatever the backup cadence is. Suggested:
  daily `db-backup.sh` via cron on the production host, plus a backup before
  every migration or bulk ingest. Monitored by the same host check that
  watches `/api/v1/admin/health` (see docs/deployment.md).
