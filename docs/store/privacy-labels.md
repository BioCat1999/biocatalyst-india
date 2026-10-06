# Privacy labels — Biocatalyst India

Milestone 10 (store readiness). Answers below are grounded in the app's
**actual** behavior as of Milestone 10: a self-hosted Next.js API + Postgres
on the operator's own server, and an Expo client that talks **only** to that
server. No analytics, no advertising, no third-party SDKs, no tracking, no
data sold or shared. Anything uncertain is marked **verify before submission**.

Mobile app data handling (`apps/mobile`):
- Sign-in email: kept in the OS secure store on-device, and sent to the
  user's own server for authentication (`POST /api/v1/auth/signin`). Never
  sent anywhere else.
- Device push token: read via the local-only `getDevicePushTokenAsync()`,
  kept in the OS secure store, and registered with the user's own server
  (`POST /api/v1/push-tokens`, auth-required). Never sent to Expo, Apple,
  Google/Firebase, or any third party.
- No analytics events, no crash-reporting SDK, no advertising ID collection.

Web app data handling (`apps/web`): email + password hash, watchlist items,
in-app alerts, issue reports (optional contact text), push tokens, and
per-IP rate-limiting logs (30-day retention) — all stored on the operator's
own server. See `apps/web/src/app/privacy/page.tsx` for the published policy.

---

## Apple App Privacy ("nutrition label")

App Store Connect → App Privacy. Answers for Biocatalyst India:

**Do you collect data from this app?** YES

| Data type (Apple category) | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| Email Address (Contact Info) | Yes — only if the user creates an account | Yes | No | App Functionality (sign-in, watchlist, alerts) |
| Device ID (Identifiers) | Yes — device push token, only if the user enables notifications | Yes | No | App Functionality (future push delivery) |

**Data Not Collected** for every other Apple data type: Location, Contacts,
Health, Financial Info, Browsing History, Search History, Usage Data,
Diagnostics, etc. — none collected.

**Key declarations:**
- "Do you or your third-party partners use data for tracking purposes?" → **No.**
- "Is any data sold or shared with data brokers?" → **No.**
- "Is data used for third-party advertising?" → **No.**

**Verify before submission:**
- If push delivery is enabled before 1.0.0 submission (currently deferred),
  confirm whether Apple's answers change for the relay chosen (direct
  FCM/APNs from the user's server vs Expo Push Service — the latter would
  add a third-party data processor to disclose).
- **verify before submission:** the published Privacy Policy URL (App Store
  Connect requires one) must be the live `https://<prod-domain>/privacy`
  page, and it must mention push-token storage (updated in Milestone 10).

---

## Google Play Data safety

Play Console → App content → Data safety questionnaire. Answers for
Biocatalyst India:

**Does your app collect or share any of the required user data types?** YES —
collects; does **not** share.

Data types collected (all stored on the operator's own server, none shared
with third parties):

| Data type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Email address (Personal info) | Yes — account sign-up only | No | Account management (sign-in, watchlist, alerts) | Yes — the app is fully usable anonymously without an account |
| Device or other IDs — push token (Device or other IDs) | Yes — only after the user enables notifications | No | App functionality (push alerts) | Yes — opt-in per device |

**Security practices (answer truthfully):**
- "Is all user data encrypted in transit?" → **Yes, provided the production
  deployment serves HTTPS** — verify before submission: the launch deployment
  must terminate TLS (the dev default `http://localhost:3000` is not
  submittable). Flag the TLS setup as a launch blocker if not done.
- "Do you provide a way for users to request deletion of their data?" →
  **Yes — via the operator contact address** (account deletion removes
  credentials, watchlists, alerts, push tokens via FK cascade). **Verify
  before submission:** the privacy policy now uses bio1941999@gmail.com
  (set 2026-10-01), and the deletion path must be exercised at least once.

**Data types NOT collected:** Location, Contacts, Photos/Videos, Audio,
Files, Calendar, Health, Financial info, Messages, App activity, Web
browsing — none.

**Verify before submission:**
- The Data safety "account deletion" answer must match the real,
  tested deletion path (contact-email flow today — consider whether the
  stores expect an in-app deletion option; Apple requires apps with
  account creation to offer in-app account deletion).
- Re-confirm after any dependency change: no new SDK may be added without
  re-answering this questionnaire.

---

## Pre-submission checklist (both stores)

- [x] Operator email set: bio1941999@gmail.com (replaced 2026-10-01)
      (privacy policy page + store listings + this doc's deletion path)
- [ ] Privacy Policy URL is live at the production domain
- [ ] Privacy policy mentions push-token storage (added M10)
- [ ] Production deployment serves HTTPS (TLS termination verified)
- [ ] Apple "in-app account deletion" requirement reviewed against the
      contact-email deletion flow
- [ ] No new third-party SDK added since this document was written
