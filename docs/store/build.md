# Build configuration — Biocatalyst India mobile app

Milestone 10 (store readiness). Everything here is prepared **locally**; no
store submission, no accounts, and no real signing identities were created.
Expo SDK 53, managed workflow. Identity (from `apps/mobile/app.json`):

- App name / slug: `Biocatalyst India` / `biocatalyst-india`
- Android package: `india.biocatalyst.app`
- iOS bundle identifier: `india.biocatalyst.app`
- Deep-link scheme: `biocatalyst-india`
- Current version: `0.1.0` (dev) → first store release will be `1.0.0`

## The prebuild flow (local, no account needed)

`expo export` (used in Milestones 9–10) produces **JS bundles only** — not
installable store artifacts. Real binaries need native projects:

```sh
cd apps/mobile
EXPO_TELEMETRY_DISABLED=1 npx expo prebuild   # generates ios/ and android/ (git-ignored)
```

This is fully local: it runs the `expo-notifications` config plugin and
writes native projects from `app.json`. After prebuild:

- Android: open `android/` in Android Studio, or `./gradlew assembleRelease`
  / `bundleRelease` from `android/`.
- iOS: open `ios/*.xcworkspace` in Xcode (requires a Mac).

Re-run `npx expo prebuild --clean` whenever `app.json` changes. Never
hand-edit generated native files for config that belongs in `app.json`.

## Versioning strategy

| Field | Where | Rule |
|---|---|---|
| `version` | `app.json` → `expo.version` | Semver (`1.0.0` for the first store release). Shown to users. Bump on every store submission. |
| `android.versionCode` | derived by Expo from `version` unless overridden | Integer, must **increase** with every Play upload (including internal tracks). Set explicitly via `expo.android.versionCode` once you ship, so hotfix builds can't collide. |
| `ios.buildNumber` | `expo.ios.buildNumber` | String of digits, must **increase** with every App Store upload of the same `version`. |

Release process:
1. Bump `expo.version` (e.g. `0.1.0` → `1.0.0`).
2. Bump `android.versionCode` (+1) and `ios.buildNumber` (+1).
3. Write release notes (template in `docs/store/listing.md`).
4. Tag the git commit (`v1.0.0`).

**For 1.0.0:** set `expo.android.versionCode: 1` and
`expo.ios.buildNumber: "1"` explicitly in `app.json` at release time.

## Android signing (user-provided)

Google Play requires every upload signed with the **same** key. Decide the
signing mode first:

- **Recommended:** let Play App Signing manage the final key — you upload
  with an *upload key* you generate; Google re-signs for distribution.
- The upload keystore below is generated **locally** by the operator.

Generate the upload keystore (example — clearly a throwaway; the operator
generates the real one on their own machine):

```sh
# EXAMPLE ONLY — do not use these values for the real keystore.
keytool -genkeypair -v -storetype PKCS12 \
  -keystore /secure/path/biocatalyst-upload-key.keystore \
  -alias biocatalyst-upload \
  -keyalg RSA -keysize 2048 -validity 10950
# keytool will prompt for a keystore password and for name/organization fields.
```

Wire it into the prebuilt project (`android/gradle.properties` — local file,
never committed):

```properties
BIOCATALYST_UPLOAD_STORE_FILE=/secure/path/biocatalyst-upload-key.keystore
BIOCATALYST_UPLOAD_KEY_ALIAS=biocatalyst-upload
BIOCATALYST_UPLOAD_STORE_PASSWORD=<password>
BIOCATALYST_UPLOAD_KEY_PASSWORD=<password>
```

and reference those properties in `android/app/build.gradle`'s `signingConfigs`
(standard React Native template block). Then:

```sh
cd apps/mobile/android && ./gradlew bundleRelease   # produces the .aab for Play
```

**Back up and never lose:** the `.keystore` file + both passwords + the
alias. If the upload key is lost, Google can reset it (Play App Signing);
if you opt out of Play signing and lose the key, you can never update the
app again. Store the keystore in two independent places (e.g. encrypted USB
+ password manager). Never commit it to git.

## iOS signing (user-provided, Mac required)

Apple signs via certificates + provisioning profiles tied to an Apple
Developer account:

1. Enroll in the **Apple Developer Program** (~$99/year) — required for App
   Store distribution. (User provides.)
2. In Xcode, add the Apple ID (Xcode → Settings → Accounts).
3. Open `ios/*.xcworkspace`, select the app target → Signing & Capabilities →
   Team = your team, enable "Automatically manage signing". Xcode creates the
   development/distribution certificates and the App Store provisioning
   profile for bundle id `india.biocatalyst.app`.
4. Capabilities: enable **Push Notifications** for the App ID (needed when
   server-side push fan-out is built; harmless to enable now), plus
   **Associated Domains** only if universal links are added later.
5. Archive: Product → Archive → Distribute App → App Store Connect.

If you prefer manual signing, create the distribution certificate and the
App Store provisioning profile at developer.apple.com and download both —
but automatic signing is recommended for a first release.

## API URL for production builds

The app reads `EXPO_PUBLIC_API_URL` at build/export time (default
`http://localhost:3000`). Production binaries must be built with the real
backend origin baked in:

```sh
EXPO_PUBLIC_API_URL=https://<prod-domain> EXPO_TELEMETRY_DISABLED=1 \
  npx expo export --output-dir dist        # or: expo prebuild, then archive
```

The Account tab displays the baked-in URL, so a wrong value is visible
immediately on-device.

## What the USER must provide (builds)

1. **Apple Developer Program membership** (~$99/year) + a Mac with Xcode
   for any iOS binary.
2. **Android upload keystore** generated via the `keytool` command above,
   stored securely in ≥2 places (never in git).
3. **Google Play developer account** (one-time ~$25) when submitting.
4. **Production API domain** (`https://<prod-domain>`) with TLS, baked in
   via `EXPO_PUBLIC_API_URL` at build time.
5. **Screenshots** per `docs/store/screenshots.md` (taken on real
   simulators/emulators/devices — not producible here).
6. **FCM credential** (Android) and **APNs key/certificate** (iOS) — only
   when server-side push fan-out is built (deferred; see
   `docs/store/crash-reporting.md` for the analogous deferred decision and
   `docs/deployment.md` for the full push list).
