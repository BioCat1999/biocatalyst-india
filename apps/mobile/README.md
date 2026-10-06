# BIOCATALYST INDIA — mobile app (Milestone 9)

Expo (React Native) mobile client for the BIOCATALYST INDIA API. It is a
**thin client**: all business logic, auth, and data live in `apps/web`
(the API) and the shared packages. The app talks only to the user's own
API base URL — no third-party network contact, no telemetry, no analytics.

## Prereqs

- Node ≥ 20, pnpm 10 (repo uses `packageManager: pnpm@10.34.6`)
- The web API running locally (see below) with Postgres up:
  `pg_isready` should report port 5432 accepting connections
  (start with `sudo pg_ctlcluster 16 main start` after a reboot).

## Setup

```sh
cd ~/workspace/biocatalyst-india
pnpm install            # installs workspace deps incl. apps/mobile
```

All Expo commands must run with telemetry disabled:

```sh
cd apps/mobile
export EXPO_TELEMETRY_DISABLED=1
```

## Configuration

| Variable               | Purpose                                  | Default               |
|------------------------|------------------------------------------|-----------------------|
| `EXPO_PUBLIC_API_URL`  | Base URL of the BIOCATALYST INDIA API    | `http://localhost:3000` |

The value is baked in at bundle time (`expo export` / `expo start`
read `EXPO_PUBLIC_API_URL` when the bundler starts). The Account tab in
the app displays the API URL it was built with, so a misconfigured
build is visible on-device.

For a phone on the same LAN as the dev machine, set it to the machine's
LAN IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.50:3000`.

## Running web + mobile together

```sh
# terminal 1 — API + web (from repo root)
cd ~/workspace/biocatalyst-india
pnpm --filter @biocatalyst/web dev        # http://localhost:3000

# terminal 2 — mobile (from repo root)
cd apps/mobile
EXPO_TELEMETRY_DISABLED=1 EXPO_PUBLIC_API_URL=http://localhost:3000 pnpm dev
# scan the QR code with Expo Go (Android) or Camera (iOS), or press:
#   a = Android emulator, i = iOS simulator, w = web browser
```

The mobile app signs in against the **same** `/api/v1/*` routes and the
same `bc_session` cookie session as the web app. After sign-in the app
captures the raw session token from the `Set-Cookie` response header and
re-attaches it as a `Cookie` header on later requests (stored in
expo-secure-store). No API change was needed and the web app's session
security is unchanged — see `packages/api-client/README.md`.

Anonymous browsing works everywhere; watchlist and alerts require
sign-in, exactly like the web app.

## Scripts

| Script      | What it does                                              |
|-------------|-----------------------------------------------------------|
| `pnpm dev`  | `expo start` (dev server + QR)                            |
| `pnpm build`| `expo export --output-dir dist` (web + iOS + Android bundles) |
| `pnpm test` | jest (`jest-expo` preset; 16 tests)                       |
| `pnpm typecheck` | `tsc --noEmit`                                        |
| `pnpm lint` | placeholder (echo) — matches other packages               |

Repo-wide equivalents work from the repo root (`pnpm test`, `pnpm
build`, `pnpm typecheck`, `pnpm lint`).

## Push notifications — plumbing status

Local-only push plumbing is implemented; **no push can actually be
delivered yet**, by design (Milestone 9 forbids new accounts/keys):

- `expo-notifications` is installed and configured
  (`app.json` plugin entry).
- `src/push/notifications.ts`: `ensurePushSetup()` requests permission,
  reads the **device** push token via `getDevicePushTokenAsync()` (purely
  native, no network), stores it in SecureStore, and calls
  `apiClient.registerPushToken()`.
- `registerPushToken()` targets `POST /api/v1/push-tokens`, which **does
  not exist yet** (Milestone 10 server work). A 404 is tolerated and
  reported as `{ registered: false }`.
- The app deliberately does **not** call `getExpoPushTokenAsync()`: that
  contacts Expo's push servers and needs an Expo account + projectId,
  which would violate the no-third-party-contact constraint.

### What the user must provide later (Milestone 10 / store builds)

1. **Backend**: implement `POST /api/v1/push-tokens` (and the sending
   side) in `apps/web`.
2. **Native push credentials** (one or both):
   - Android: a Firebase Cloud Messaging (FCM) server key / service
     account, added to the native project (config plugin or
     `google-services.json`).
   - iOS: an Apple Push Notification service (APNs) key/certificate and
     a paid Apple Developer account.
3. **Builds**: Expo Go cannot do remote push on SDK 53 (Android push was
   removed from Expo Go). Use a development build (`expo-dev-client`)
   or a store build. EAS cloud build was deliberately **not** set up
   (no accounts per Milestone 9 constraints); see
   `docs/deployment.md` for the local `expo export` / prebuild path.
4. **Expo account + projectId** only if the Expo Push Service is chosen
   as the relay; alternatively send directly via FCM/APNs from the
   user's own server (keeps the no-third-party rule intact).

## Project layout

```
apps/mobile/
  App.tsx                root component, navigation + providers
  index.ts               registerRootComponent entry
  app.json               Expo config (name, slug, scheme, plugins)
  src/
    theme/               design tokens (copied from apps/web globals.css)
    api.ts               api-client singleton (SecureStore token storage)
    auth/                AuthContext (session state, sign in/out/up)
    push/                notifications plumbing + token persistence
    lib/                 useApiCall hook, formatting helpers
    ui/                  primitives (Button, Card, Chip, TextField, ...)
    components/          EventCard, FollowButton
    navigation/          RootStack + MainTabs (Feed/Search/Watchlist/Alerts/Account)
    screens/             12 screens per spec §4
```

## Notes & troubleshooting

- **Metro bundler port**: default 8081. If busy, `expo start --port 8082`.
- **jest + pnpm**: the stock react-native `transformIgnorePatterns`
  does not match pnpm's `node_modules/.pnpm/...` layout, so
  `jest.config.js` carries a pnpm-aware variant. If you add native
  deps and jest complains a file "is ignored by transformers", extend
  the allow-list there.
- **`@types/react` is pinned workspace-wide** (`pnpm.overrides` in the
  root `package.json` → 19.3.0). A second copy (e.g. 19.0.14 via
  react-native's peer range) breaks `apps/web` typechecking with
  `TS2786`/`TS4023` errors — do not add another @types/react version.
- **Expo Go + push**: remote push does not work in Expo Go on SDK 53;
  the "Enable push notifications" toggle in the Account tab will still
  register the device token locally where possible.
- **iOS simulator**: push tokens are unavailable on simulators; use a
  physical device for end-to-end push testing later.
