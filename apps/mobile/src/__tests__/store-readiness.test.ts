/**
 * Milestone 10 — store-readiness assertions (fast, local, no toolchains).
 *
 * 1. Required image assets exist at the exact sizes stores demand
 *    (IHDR dimensions parsed from the PNG headers — no image libraries).
 * 2. apps/mobile/app.json is valid JSON and references the real asset
 *    files; icon / splash / adaptive-icon are wired for both platforms.
 * 3. Permission audit: no camera/location/microphone/contacts/calendar
 *    (or any unexpected) permission is declared or implied by config;
 *    the only Expo config plugin is expo-notifications.
 * 4. docs/store/ is complete: permissions, privacy-labels, screenshots,
 *    build, crash-reporting, listing.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..", "..");
const MOBILE = join(REPO, "apps", "mobile");

/** Read width/height from a PNG's IHDR chunk (no image deps). */
function pngDimensions(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error(`${path} is not a PNG`);
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR")
    throw new Error(`${path}: first chunk is not IHDR`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function appJson(): any {
  return JSON.parse(readFileSync(join(MOBILE, "app.json"), "utf8"));
}

describe("store assets (apps/mobile/assets)", () => {
  const expected: Record<string, { width: number; height: number }> = {
    "icon.png": { width: 1024, height: 1024 }, // App Store 1024x1024 requirement
    "adaptive-icon.png": { width: 1024, height: 1024 }, // Android adaptive foreground
    "splash.png": { width: 1024, height: 1024 }, // Expo splash.image
    "favicon.png": { width: 48, height: 48 }, // Expo web
  };
  for (const [file, size] of Object.entries(expected)) {
    it(`${file} exists at ${size.width}x${size.height}`, () => {
      const path = join(MOBILE, "assets", file);
      expect(existsSync(path)).toBe(true);
      expect(pngDimensions(path)).toEqual(size);
    });
  }
});

describe("apps/mobile/app.json", () => {
  it("is valid JSON with the required identity fields", () => {
    const cfg = appJson();
    expect(cfg.expo.name).toBe("Biocatalyst India");
    expect(cfg.expo.slug).toBe("biocatalyst-india");
    expect(cfg.expo.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(cfg.expo.android.package).toBe("india.biocatalyst.app");
    expect(cfg.expo.ios.bundleIdentifier).toBe("india.biocatalyst.app");
  });

  it("wires icon, splash, and adaptive icon to existing asset files", () => {
    const cfg = appJson().expo;
    const refs = [
      cfg.icon,
      cfg.splash?.image,
      cfg.ios?.icon,
      cfg.android?.adaptiveIcon?.foregroundImage,
    ];
    expect(refs.every((r) => typeof r === "string" && r.length > 0)).toBe(true);
    for (const ref of refs as string[]) {
      expect(existsSync(resolve(MOBILE, ref))).toBe(true);
    }
    expect(cfg.android.adaptiveIcon.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(cfg.splash.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("permission audit", () => {
  it("declares no camera/location/microphone/contacts/calendar permissions", () => {
    const raw = readFileSync(join(MOBILE, "app.json"), "utf8");
    const forbidden = [
      "CAMERA",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "RECORD_AUDIO",
      "READ_CONTACTS",
      "READ_CALENDAR",
      "NSCameraUsageDescription",
      "NSLocationWhenInUseUsageDescription",
      "NSLocationAlwaysUsageDescription",
      "NSMicrophoneUsageDescription",
      "NSContactsUsageDescription",
      "NSCalendarsUsageDescription",
    ];
    for (const f of forbidden) expect(raw).not.toContain(f);
  });

  it("uses no Expo config plugin beyond expo-notifications", () => {
    const plugins = appJson().expo.plugins as unknown[];
    expect(plugins).toEqual(["expo-notifications"]);
  });

  it("does not pin android.permissions (library manifest merge provides notification permissions)", () => {
    // Setting android.permissions: [] would strip POST_NOTIFICATIONS /
    // RECEIVE_BOOT_COMPLETED declared by expo-notifications' own manifest
    // and silently break future push delivery — see docs/store/permissions.md.
    expect(appJson().expo.android.permissions).toBeUndefined();
  });
});

describe("docs/store completeness", () => {
  for (const doc of [
    "permissions.md",
    "privacy-labels.md",
    "screenshots.md",
    "build.md",
    "crash-reporting.md",
    "listing.md",
  ]) {
    it(`${doc} exists and is non-trivial`, () => {
      const path = join(REPO, "docs", "store", doc);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8").length).toBeGreaterThan(500);
    });
  }
});
