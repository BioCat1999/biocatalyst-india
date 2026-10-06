# Deployment — Biocatalyst India (Milestone 8)

> **Nothing in this document has been executed.** No accounts were created,
> no domains bought, no deploys run. This is a comparison + checklist so the
> operator can choose later. (Spec §18, hard M8 constraint: everything stays
> local until the user decides.)

## Option A — Cloudflare Pages (static-ish Next.js) + Workers (cron/ingest)

How it maps: Next.js app built with `@cloudflare/next-on-pages`; Postgres
via a managed provider (Supabase free tier or Neon free tier); scheduled
ingestion via a Cloudflare Worker cron trigger hitting
`POST /api/v1/admin/ingestion/run` with `ADMIN_TOKEN`.

- **Cost assumption**: Pages free tier: 500 builds/month, unlimited
  bandwidth for static, 100k Worker requests/day free. Supabase free:
  500 MB DB, 2 GB bandwidth, 50k monthly active users. Neon free: 3 GB
  storage, 10 branches. **Realistic MVP cost: ₹0/month** until traffic or DB
  size exceeds free tiers.
- **What the user must provide**:
  1. A Cloudflare account (email signup).
  2. A managed Postgres (Supabase/Neon account) + `DATABASE_URL` connection
     string with a least-privilege role (NOT the service-role key in the app).
  3. A domain registrar account + the domain itself (~₹800–1,200/year for
     `.in`); DNS pointed at Cloudflare (nameserver change at the registrar).
     Note: Cloudflare Registrar does **not** support `.in` — buy the `.in`
     at Namecheap/Porkbun/etc., then add it to Cloudflare's free plan and
     switch nameservers; hosting stays free. (Or buy a `.com` directly at
     Cloudflare Registrar if you want everything under one roof.)
  4. `ADMIN_TOKEN` (long random secret, stored in the host's env UI, never in
     git).
  5. A contact email for the legal pages — now `bio1941999@gmail.com`
     (set 2026-10-01) — and an abuse/DMCA contact.
- **Billing safeguards**: Cloudflare free plan has no card-on-file billing to
  trip — but enable “usage notifications”; Supabase/Neon: set the project's
  spend cap / disable auto-upgrade, add billing email alerts at 50/80%.
- **Kill-switch**: pause the Worker cron + disable the Pages deployment from
  the dashboard (one click each); rotate `ADMIN_TOKEN` if abuse is suspected.

## Option B — Vercel (Next.js) + managed Postgres

How it maps: `vercel` CLI / GitHub import of `apps/web`; same managed
Postgres as above; ingestion via Vercel Cron (hits the admin ingestion
endpoint) — note Vercel Cron needs a paid plan for <daily schedules, so MVP
uses daily or an external cron.

- **Cost assumption**: Vercel Hobby free: 100 GB bandwidth, 6,000 build
  minutes/month, serverless function limits. **Realistic MVP cost: ₹0/month**
  (Hobby) as long as bandwidth and function duration stay inside free limits.
- **What the user must provide**:
  1. A Vercel account (GitHub/GitLab/Bitbucket login).
  2. Managed Postgres `DATABASE_URL` (least-privilege role) as above.
  3. Domain registrar account + domain; DNS via Vercel nameservers or
     CNAME/A records.
  4. `ADMIN_TOKEN` in Vercel's env UI; production branch protection so
     previews don't get secrets.
  5. Contact email for legal pages (placeholder to replace).
- **Billing safeguards**: Hobby has hard free limits (no card → no charge);
  set up Vercel usage email alerts; keep an eye on bandwidth (images are
  local, so the feed is cheap).
- **Kill-switch**: “Pause” the project in Vercel dashboard; redeploy a
  previous build or roll `ADMIN_TOKEN`.

## Option C — Self-hosted VPS (Docker + Caddy)

How it maps: one VPS (Hetzner CX22 ~€4.15/mo, or DigitalOcean $6/mo);
Postgres 16 in Docker with a volume; the Next.js app in Docker
(`next start`); Caddy as reverse proxy with automatic HTTPS; system cron for
`db-backup.sh` and for hitting `/api/v1/admin/health`.

- **Cost assumption**: VPS ≈ **₹350–550/month** + domain ≈ ₹800–1,200/year.
  No bandwidth overage surprises at MVP scale. Most control, but the
  operator owns patching, backups and uptime.
- **What the user must provide**:
  1. A VPS provider account + payment method (this is the only option with a
     mandatory monthly bill).
  2. SSH access; Docker + Caddy installed (see runbook-style steps below —
     write them when this option is chosen).
  3. Domain registrar account + domain; DNS A/AAAA records → the VPS IP.
  4. `DATABASE_URL` (local Docker Postgres), `ADMIN_TOKEN`, contact email.
  5. An off-site copy of `backups/` (object storage or rsync target) — a VPS
     disk dying must not take the backups with it.
- **Billing safeguards**: VPS is flat-rate — set the provider's billing alert
  anyway; disable any “auto-scale” add-ons; snapshot costs are the usual
  surprise (Hetzner snapshots ~€0.01/GB/mo — track them).
- **Kill-switch**: `docker stop` the app container + Caddy serving a
  maintenance page; firewall the DB port.

## Option D — Google Cloud Run (container) + managed Postgres

How it maps: the Next.js app ships as a container (`apps/web/Dockerfile`,
multi-stage pnpm build, `next start` on `$PORT`); Postgres via Supabase/Neon
free tier (Cloud SQL has no free tier); scheduled ingestion via Cloud
Scheduler hitting `POST /api/v1/admin/ingestion/run` with
`Authorization: Bearer <ADMIN_TOKEN>`.

- **Cost assumption**: Cloud Run Always Free (2M requests + 180k
  vCPU-seconds + 360k GiB-seconds/month) + free Postgres =
  **₹0/month**; domain ≈ ₹850–1,200/year. Region `asia-south1` (Mumbai).
- **Trade-offs vs A/B**: Google requires a billing account **with a card on
  file** even for free-tier use; Cloudflare/Vercel free need no card. Cloud
  Run free quota is per billing account, not per project.
- **Full runbook**: `docs/deployment-cloud-run.md` (build via Cloud Build —
  no local Docker needed — secrets, domain mapping, scheduler, billing
  alerts, rollback).

## Recommendation (for the user to decide)

Start with **Option A or B at ₹0** for the public PWA; keep ingestion on a
laptop cron until a source needs to run unattended. Move to **Option C**
only when monthly usage, data-residency, or cost math justifies owning the
box. All three keep the same Postgres schema and `ADMIN_TOKEN` gating, so
migrating later is a `pg_dump`/`pg_restore` away.

## Billing safeguards (all options)

- Billing alerts at 50% and 80% of every free-tier quota, to the operator's
  email — configure on day one, before first deploy.
- Hard usage limits where the platform offers them (spend caps, “pause on
  overage”); never attach auto-upgrade-to-paid without an explicit decision.
- Model/market-data providers are fixture-only in MVP: **no model API keys
  exist**, so there is no LLM bill to guard yet. When a real provider is
  added, set its own spend cap + daily alert before enabling.
- Kill-switches: each option above lists a <5-minute “stop the bleeding”
  path (pause project / stop container / rotate `ADMIN_TOKEN`).

## Monitoring without third parties (spec §20)

Deliberately **no Sentry, no analytics vendor, no error-tracking SaaS** is
integrated — per the project's no-tracking rule (see README “Telemetry”),
the app makes zero third-party network requests (verified by the
`no-external-requests` test).

Self-hosted monitoring recipe (works on any option, including the VPS):

1. **Health endpoint**: `GET /api/v1/admin/health` reports service status,
   DB reachability, per-source adapter health and last successful ingestion
   (open read-only by design; the expensive ingestion *run* endpoint stays
   `ADMIN_TOKEN`-gated).
2. **Cron check** (every 15 min on the operator's machine or the VPS):
   ```bash
   curl -sf https://<domain>/api/v1/admin/health >> /var/log/biocatalyst-health.log \
     || echo "$(date -u +%FT%TZ) HEALTH CHECK FAILED" | tee -a /var/log/biocatalyst-health.log
   ```
   Alerting = “the log shows a failure line”. For MVP, a daily manual glance
   at the log plus the admin review page is the on-call rotation. A
   dead-man's-switch (e.g. a free-tier uptime pinger pointed at `/healthz`)
   is optional and must be privacy-checked before use.
3. **Source of truth**: the `ingestion_runs` table — every ingestion pass
   logs start/end, documents fetched/changed, events created/rejected, model
   failures and source latency. “Is ingestion healthy?” =
   `SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 5;`
   Freshness per source = `last successful fetch` + `newest source
   timestamp`, surfaced on `/api/v1/admin/health`.
4. **App logs**: Next.js stdout (systemd journal / docker logs on the VPS;
   Vercel/Cloudflare dashboards on serverless). No log shipping vendor.
5. **Backups**: daily `scripts/db-backup.sh` via cron; verify with
   `scripts/db-restore.sh` into a scratch DB monthly (see
   docs/runbook.md “Backup & restore”).

## Pre-launch checklist (user decisions still needed)

- [ ] Choose deployment option A, B or C.
- [ ] Provide: domain + registrar access, host account, DNS changes,
      `DATABASE_URL` (least-privilege), `ADMIN_TOKEN`, contact email.
- [x] Replace `contact@example.com` placeholder in `/privacy` and `/terms` — done 2026-10-01 (`bio1941999@gmail.com`).
- [ ] Decide data-retention numbers in `/privacy` (currently: logs 30 days,
      issue reports until resolved) — confirm they're acceptable.
- [ ] Confirm fixture-vs-real labelling on public pages before announcing.
- [ ] Set billing alerts + spend caps on day one.
- [ ] Run one real `db-backup.sh` → `db-restore.sh` cycle on the production
      host and record the measured recovery time in the runbook.

## Mobile app builds & push (Milestone 9 — local only)

> Nothing below has been executed: no store builds produced, no Expo/FCM/
> APNs accounts created, no credentials generated. `expo export` was run
> locally and produces web + iOS + Android JS bundles in
> `apps/mobile/dist/` — these are **not** installable store artifacts.

**Local verification (done, no account needed):**
`EXPO_TELEMETRY_DISABLED=1 pnpm --filter @biocatalyst/mobile build`
runs `expo export --output-dir dist`. For on-device testing, `pnpm
--filter @biocatalyst/mobile dev` + Expo Go works for everything except
remote push (removed from Expo Go on SDK 53).

**What the user must provide for real builds:**
1. **Development builds** (recommended before store): `npx expo prebuild`
   generates native projects, then build locally with Xcode (Mac
   required for iOS) / Android Studio. Needs no Expo account.
2. **EAS cloud build** (optional alternative): requires an Expo account;
   `eas build` uploads the project to Expo's servers. Not set up —
   contradicts the local-only constraint unless the user opts in.
3. **Store submission**: Apple Developer Program (paid, ~$99/year) for
   iOS App Store; Google Play developer account (one-time ~$25) for
   Android. App name/slug `biocatalyst-india`, scheme
   `biocatalyst-india`, Android package `india.biocatalyst.app`, iOS
   bundle id derived from the slug — all set in `apps/mobile/app.json`.
4. **API URL for production builds**: bake in with
   `EXPO_PUBLIC_API_URL=https://<prod-domain>` at export time (the app
   shows the built-in URL on the Account tab).

**What the user must provide for working push notifications
(Milestone 10 server work + credentials):**
1. Backend: implement `POST /api/v1/push-tokens` and the alert→push
   fan-out in `apps/web` (currently the mobile stub tolerates 404).
2. Android: Firebase Cloud Messaging credential (service-account JSON or
   legacy server key) wired into the native project
   (`google-services.json` via config plugin).
3. iOS: APNs key (`.p8`) or certificate from the Apple Developer
   account, configured for the app's bundle id.
4. Relay choice: send directly from the user's server via FCM/APNs
   (keeps the no-third-party rule) **or** use Expo Push Service, which
   additionally needs an Expo account + `projectId` in `app.json` and
   routes notifications through Expo's servers.
5. Test on a physical device via a development build — simulators and
   Expo Go cannot receive remote pushes.

---

## Store-submission checklist (Milestone 10 — final milestone)

All store-readiness artifacts are prepared locally in `docs/store/`
(permissions, privacy-labels, screenshots, build, crash-reporting,
listing) plus app icons/splash in `apps/mobile/assets/` and
`POST /api/v1/push-tokens`. **Nothing has been submitted and no accounts
exist.** Work through this list in order; every item is a user action.

### Accounts & money
- [ ] Apple Developer Program enrollment (~$99/year) — required for iOS App Store
- [ ] Google Play developer account (one-time ~$25) — required for Android
- [ ] Decide: EAS cloud builds (needs an Expo account; contradicts the
      local-only constraint unless you opt in) vs local prebuild + Xcode /
      Android Studio (recommended; see `docs/store/build.md`)

### Production backend (the mobile app needs a real API origin)
- [ ] Production domain with **TLS** (launch blocker: privacy labels
      declare data encrypted in transit)
- [ ] Deploy `apps/web` per the earlier sections of this document; run
      migrations through `009_push_tokens.sql`
- [ ] Bake the origin into binaries: `EXPO_PUBLIC_API_URL=https://<prod-domain>`
- [x] Replace the `contact@example.com` placeholder (in-app privacy page,
      store listings) with a real, monitored operator address — done 2026-10-01 (`bio1941999@gmail.com`)
- [ ] Exercise the account-deletion path end-to-end (privacy labels claim
      deletion-on-request); review Apple guideline 5.1.1(v) on in-app
      account deletion vs the current contact-email flow
- [ ] Decide data retention for push tokens and document it (see
      `docs/store/privacy-labels.md`)

### Signing & versioning
- [ ] Generate the Android upload keystore (`keytool` — see
      `docs/store/build.md`); back up keystore + passwords + alias in ≥2
      places, never in git
- [ ] iOS: Mac + Xcode signing for bundle id `india.biocatalyst.app`;
      enable the Push Notifications capability for the App ID
- [ ] Release 1.0.0: set `expo.version: 1.0.0`,
      `expo.android.versionCode: 1`, `expo.ios.buildNumber: "1"`; tag `v1.0.0`

### Store assets & listings
- [ ] Capture screenshots per `docs/store/screenshots.md` (iPhone 6.7"/6.5",
      iPad 13", Android phone + 7"/10" tablets) on simulators/emulators/devices
- [ ] Fill `docs/store/listing.md` placeholders: support/marketing URLs,
      support email, copyright holder; verify keywords ≤100 chars
- [ ] Answer age-rating questionnaires live in both consoles
- [ ] Verify privacy labels at submission time: Apple App Privacy answers
      and Play Data safety answers in `docs/store/privacy-labels.md`
      (re-confirm after any dependency change; the Privacy Policy URL must
      be live and mention push-token storage)
- [ ] Confirm merged Android manifest permissions and iOS Info.plist per
      `docs/store/permissions.md`

### Push delivery (deferred — needed before advertising push alerts)
- [ ] FCM credential (Android) and APNs key/certificate (iOS)
- [ ] Build the alert→push fan-out worker (tokens are already registered
      via `POST /api/v1/push-tokens`); test on a physical device with a
      development build
- [ ] If using Expo Push Service instead of direct FCM/APNs: Expo account
      + `projectId` in `app.json`, and update privacy labels (new
      third-party processor)

### Spec launch checklist reminder (§26)
Only after the spec's launch checklist passes (≥50 curated companies,
reliable source running automatically, admin review queue functioning,
PWA on custom domain, error monitoring + billing alerts, terms/privacy/
disclaimer/data-correction contact visible): publish the Android/iOS apps.
