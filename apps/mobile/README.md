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
| `EXPO_PUBLIC_API_URL`  | Base URL of the BIOCATALYST INDIA API    | Production Vercel URL |

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

The Android app requires email/password sign-in before app content opens.
Users can register with any valid email address, including a Gmail address;
the session is then restored securely on later launches.

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

## Push notifications

Remote notifications are deferred. Version 1.0.0 contains no notification
permission prompt, token registration, or `expo-notifications` dependency.
The Alerts tab is an in-app inbox backed by the first-party API.

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
  root `package.json` → 19.1.17). A second incompatible copy can break
  `apps/web` typechecking with
  `TS2786`/`TS4023` errors — do not add another @types/react version.
- **Release signing**: the local Expo config plugin makes clean prebuilds use
  the upload-key properties documented in `docs/store/build.md`.
