# App permissions — Biocatalyst India mobile app

Milestone 10 (store readiness). This document records **every** permission the
app requests, the exact user-facing copy, and what is deliberately **not**
requested. Grounded in `apps/mobile/app.json`, the `expo-notifications`
plugin, and the app's actual code (Expo SDK 53, managed workflow).

## Permissions the app needs

### 1. Notifications (the only runtime permission)

| Platform | Permission | How it is obtained |
|---|---|---|
| iOS | Push / notification authorization | System prompt triggered by `expo-notifications` → `requestPermissionsAsync()`, only when the user taps **"Enable push notifications"** on the Account tab |
| Android | `android.permission.POST_NOTIFICATIONS` (runtime, Android 13+) | Same flow; declared by the `expo-notifications` library's own Android manifest |

**Exact user-facing rationale copy** (shown on the Account screen *before*
the OS prompt, `apps/mobile/src/screens/AccountScreen.tsx`):

> Enable push notifications to get alerted when companies, drugs, or trials
> you follow have new catalyst events. You can change this any time in system
> Settings.

Post-setup status strings (exact):
- Granted + registered: "Enabled — this device will receive push alerts once server delivery is configured."
- Granted, token on-device only: "Permission granted. Token saved on-device; the server push endpoint is not live yet (Milestone 9 plumbing)."
- Denied: "Permission denied. Enable notifications in system Settings to receive alerts."
- Undetermined: "Permission not decided yet."
- Unavailable: "Push tokens are unavailable on this device/emulator." (or the underlying detail)
- Error: "Something went wrong while setting up push." (or the underlying detail)

No custom iOS `Info.plist` usage-description key is needed for notifications:
iOS does not require an `NS*UsageDescription` string for push/local
notifications — the system authorization dialog handles the ask, and the
in-app rationale above is shown first. `app.json` therefore sets no
`ios.infoPlist` usage descriptions.

### 2. Android manifest permissions from library merge (not user-requested)

These come from the `expo-notifications` library's Android manifest
(verified in `node_modules/.pnpm/expo-notifications@0.31.5…/android/src/main/AndroidManifest.xml`)
and are merged into the final manifest at `expo prebuild` time:

- `android.permission.POST_NOTIFICATIONS` — delivering notifications (Android 13+ asks at runtime; older versions grant at install)
- `android.permission.RECEIVE_BOOT_COMPLETED` — re-scheduling local notifications after a reboot (only used if the app schedules notifications in the future; currently registered for manifest completeness)

**Important:** `app.json` deliberately does **not** set `android.permissions`.
Setting it to `[]` would *strip* these library-declared permissions at merge
time and silently break push delivery later. The merged list above is the
final list — assert it after `expo prebuild` by inspecting
`android/app/src/main/AndroidManifest.xml`.

## Permissions the app does NOT need — asserted

The app requests **none** of the following, and `app.json` / code must keep
it that way (asserted by `apps/mobile/src/__tests__/store-readiness.test.ts`):

- Camera (`CAMERA` / `NSCameraUsageDescription`)
- Location — fine, coarse, or background (`ACCESS_*_LOCATION` / `NSLocation*UsageDescription`)
- Microphone (`RECORD_AUDIO` / `NSMicrophoneUsageDescription`)
- Contacts (`READ_CONTACTS` / `NSContactsUsageDescription`)
- Calendar (`READ_CALENDAR` / `NSCalendarsUsageDescription`)
- Storage, phone state, Bluetooth, NFC, sensors — none
- No background modes (no `UIBackgroundModes` on iOS)

The only Expo config plugin is `expo-notifications`; adding any plugin that
pulls in further permissions (e.g. `expo-camera`, `expo-location`) requires
updating this document and the privacy labels first.

## Data collected through permissions

The device push token is read via `getDevicePushTokenAsync()` — a purely
local native call — stored in the OS secure store on-device, and POSTed to
the user's own server (`POST /api/v1/push-tokens`, auth-required). It is
never sent to Expo's servers, Firebase, Apple, or any third party:
`getExpoPushTokenAsync()` is deliberately **not** used (it contacts Expo's
push service and requires an Expo account/project).

## Checklist before submission

- [ ] After `expo prebuild`, diff the merged Android manifest against §2 above
- [ ] Confirm no `NS*UsageDescription` keys exist in the iOS `Info.plist`
- [ ] Confirm Google Play's "Permissions" declaration lists only the two permissions in §2
- [ ] Re-run `apps/mobile` jest suite (permission audit test)
