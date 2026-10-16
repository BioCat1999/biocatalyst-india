# Screenshot plan — Biocatalyst India mobile app

Milestone 10 (store readiness). No emulator screenshots were taken here (no
device toolchains in this environment). This plan is written so the operator
can execute it later on a Mac (Xcode Simulator) and/or Android emulator or
physical devices.

The app is portrait-only (`"orientation": "portrait"`) and light-mode
(`"userInterfaceStyle": "light"`) — capture all shots in portrait, light mode.

## Required device classes

### Apple App Store (App Store Connect)

`ios.supportsTablet` is `true`, so iPad screenshots are required.

| Class | Resolution (px) | Notes |
|---|---|---|
| iPhone 6.7" | 1290 × 2796 | **Required.** e.g. iPhone 15 Pro Max / 16 Pro Max simulator |
| iPhone 6.5" | 1242 × 2688 | **Required.** e.g. iPhone 11 Pro Max simulator |
| iPad Pro 13" | 2048 × 2732 | **Required** because the app declares tablet support |

Up to 10 screenshots per class; at least the first 3 should sell the core
value (feed → event detail → alerts). JPG or PNG, no alpha channel.

### Google Play (Play Console)

| Class | Requirement | Notes |
|---|---|---|
| Phone | Min 2, up to 8 (portrait 9:16 or landscape 16:9; 320px–3840px per side) | Use 1080 × 2400 captures |
| 7" tablet | Min 1 recommended (up to 8) | e.g. 1200 × 1920 |
| 10" tablet | Min 1 recommended (up to 8) | e.g. 1600 × 2560 |

Because the app supports tablets, capture both tablet classes — Play
increasingly expects them and they cost one extra capture session.

## Shot list (use the same sequence on every device class)

| # | Screen (app route) | What must be visible | Copy / staging notes |
|---|---|---|---|
| 1 | Feed (tabs → Feed) | Event cards, event-type filter chips | Logged-out state; filter chips show taxonomy |
| 2 | Event detail | Headline, fact box (company/drug/trial links) | A regulatory-approval event with a full fact box |
| 3 | Event detail (scrolled) | Market-reaction window + provider, sources list | Shows "exact measurement window and provider" differentiator |
| 4 | Company detail | Profile, linked drugs/trials/events | Use a company with rich links |
| 5 | Search | Grouped results (companies / drugs / trials) | Pre-fill query "sun" or similar with real results |
| 6 | Watchlist | Followed entities | Signed-in staging account |
| 7 | Alerts | Alert list, unread state | Same staging account with unread alerts |
| 8 | Account | Account controls and privacy links | Shows sign-out, deletion, support, and policy access |

App preview video is optional — skip for 1.0.0.

## Status bar & staging rules

- Status bar: 9:41, full signal/wifi/battery, no carrier name quirks. On
  iOS Simulator this is automatic for screenshots; on devices, enable a
  clean status bar before capturing.
- No debug banners, no "Expo Go" chrome — capture from a **development
  build or prebuild binary**, never from Expo Go.
- Use the staging account `screenshots@example.com`-style address that is
  clearly non-personal; delete it afterwards.
- Seed/fixture events must be labelled as demo data if visible (the web app
  labels fixtures; mirror that on mobile).
- No lorem ipsum, no placeholder text anywhere in frame.
- Portrait only; do not rotate.

## How to capture (operator steps)

**iOS Simulator (Mac with Xcode — required for iOS shots):**
1. `npx expo prebuild` then open `ios/*.xcworkspace` in Xcode, or use a
   development build installed on the simulator.
2. Boot the right device: `xcrun simctl boot "iPhone 16 Pro Max"`.
3. Point the app at staging: build with `EXPO_PUBLIC_API_URL=https://<staging>`.
4. Walk the shot list; capture each with `xcrun simctl io booted screenshot shot-N.png`
   (or ⌘S in Simulator). Verify the file dimensions match the table above.

**Android (Android Studio emulator or physical device):**
1. `npx expo prebuild`, open `android/` in Android Studio, run on the
   target AVD (create AVDs matching the phone/7"/10" classes).
2. Capture: `adb exec-out screencap -p > shot-N.png` (emulator), or
   Volume-down + Power on a physical device.
3. Resize only if needed — never upscale.

**Framing:** use the platform's required pixel sizes exactly (table above).
Do not add device bezels, marketing text overlays, or localized copy for
1.0.0 (single locale: English).

## Checklist

- [ ] 3 iOS classes × 8 shots, exact resolutions, portrait, light mode
- [ ] Play phone (≥2) + 7" + 10" tablet shots
- [ ] Staging account deleted; no personal data in any frame
- [ ] Files named `ios-6.7-01-feed.png` … / `play-phone-01-feed.png` … and
      stored outside the repo (they are binary marketing assets, not code)
