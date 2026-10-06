# Crash reporting decision — Biocatalyst India

Milestone 10 (store readiness).

## Decision: no third-party crash reporter is integrated

Per the project's hard privacy constraint — **no third-party network
contact, no telemetry/analytics, no external accounts** — we deliberately
do **not** integrate Sentry, Crashlytics/Firebase, Bugsnag, or any other
third-party crash-reporting SDK into either the web app or the mobile app.

Rationale:
- Every mainstream crash reporter phones home to vendor infrastructure,
  ships a persistent device/user identifier, and requires an external
  account — all three violate the local-only / no-third-party rule that
  governs this build (spec §21 guardrails, repo privacy policy).
- The app handles sensitive-adjacent data (account emails, device push
  tokens); routing crash payloads (which can include breadcrumbs with
  request data) through a vendor was judged an unacceptable trade.
- The app is a thin client over a self-hosted API; most failure modes are
  server-side and already observable in the operator's own logs and the
  admin health view.

## What is lost

- No automatic collection of native (Java/Obj-C) crash stack traces from
  the field.
- No symbolicated JS stack traces for production mobile crashes, no
  release-health / crash-free-rate dashboards, no alerting on new issues.
- Diagnosing a user-reported mobile crash today means asking the user what
  they were doing and reproducing it locally — slower than a crash
  reporter, acceptable at 1.0.0 scale.

## What exists instead (no new dependencies)

- **Mobile:** every async flow (`ensurePushToken`, auth, API calls) is
  written never-to-throw: failures surface as plain-language UI state with
  retry, so crashes are rare and users can report what they saw. The JS
  layer has 16+ jest tests; `expo export` typechecks clean.
- **Web:** server errors are logged to the operator's own stdout/logs
  (captured by whatever process manager hosts the deployment — see
  `docs/runbook.md`); the admin health endpoint (`/api/v1/admin/health`)
  already aggregates ingestion/adapter failures.
- **Privacy page** states plainly that the app "does not phone home to any
  analytics or crash-reporting vendor" — this decision keeps that true.

## Deferred alternative (self-hosted, no third party)

If field crash visibility becomes necessary, the privacy-compatible path
is a **self-hosted error-log endpoint**, not a vendor SDK:

1. Add `POST /api/v1/client-errors` (auth-optional, Zod-validated,
   aggressively rate-limited, payload-capped) accepting `{ platform,
   appVersion, message, stack?, context? }`.
2. Add a global JS error boundary / `ErrorUtils` handler in
   `apps/mobile` that POSTs redacted reports to the user's own server
   only (never include push tokens, emails, or request bodies).
3. Surface aggregates in the existing **admin health view**
   (`/api/v1/admin/health`) next to ingestion metrics — no new dashboard
   service.
4. Document it in the privacy policy (data type: diagnostics; retention:
   30 days like server logs) and update both stores' privacy labels.

This is **deferred** — not built in Milestone 10. Revisit when the app has
real users and a crash is reported that cannot be reproduced locally.

## Checklist if the decision is ever reversed

- [ ] Privacy policy updated (diagnostics collection, retention)
- [ ] Apple privacy label / Play Data safety re-answered (Diagnostics data type)
- [ ] Vendor DPA signed; data-residency reviewed
- [ ] Payload redaction verified (no emails, tokens, or PII in reports)
