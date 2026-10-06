# @biocatalyst/api-client

Typed HTTP client for the BIOCATALYST INDIA `/api/v1/*` API, shared by
the Expo mobile app (and usable by any future client). Thin by design:
all business logic stays server-side; this package only transports,
validates, and maps errors.

## Usage

```ts
import { createApiClient, MemoryTokenStorage } from "@biocatalyst/api-client";

const api = createApiClient({
  baseUrl: "http://localhost:3000",
  tokenStorage: new MemoryTokenStorage(), // or SecureStore-backed on mobile
});

await api.signIn({ email, password }); // captures bc_session cookie token
const feed = await api.listEvents({ limit: 20 }); // validated EventCard[]
await api.follow({ entityType: "company", entityId: "..." });
```

## Session handling (no API changes)

The web API authenticates with an HttpOnly `bc_session` cookie session.
`fetch` in React Native does not share a cookie jar, so the client:

1. After `signIn`/`signUp`, reads the raw session token from the
   `Set-Cookie` response header (`parseSessionTokenFromSetCookie`).
2. Persists it via the injected `TokenStorage` (expo-secure-store in
   `apps/mobile/src/api.ts`, in-memory default here).
3. Attaches it as a `Cookie: bc_session=<token>` header on subsequent
   requests (public endpoints don't need it but send it harmlessly).

No token was added to any response body, so web session security is
unchanged. `signOut` calls the server endpoint and always clears the
local token, even if the request fails.

## Validation & errors

- Every response is parsed with a zod v4 schema in `schemas.ts`; each
  schema carries a compile-time drift guard against the canonical types
  in `@biocatalyst/types` (a type change that the client doesn't mirror
  fails `tsc`).
- HTTP/transport failures map to typed errors in `errors.ts`
  (`ApiError` with `code`: `unauthorized`, `forbidden`, `not_found`,
  `conflict`, `validation`, `rate_limited`, `server`, `network`,
  `invalid_response`).

## Push-token stub

`registerPushToken({ token, platform })` POSTs to
`/api/v1/push-tokens`, which does not exist yet (Milestone 10 server
work). A 404 is tolerated and returned as `{ registered: false }` so
the mobile app's push plumbing can ship before the backend exists.

## Scripts

`pnpm build` (tsc → `dist/`), `pnpm test` (vitest, 27 tests),
`pnpm typecheck`, `pnpm lint` (placeholder).
