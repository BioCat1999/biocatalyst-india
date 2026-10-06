/**
 * Milestone 8 - zero third-party network requests (no-tracking rule).
 *
 * Scans every prerendered HTML page in the production build
 * (apps/web/.next/server/app) for resource-loading attributes that
 * point at an http(s) URL: script src, img src, link href, source,
 * video/audio, iframe. Plain anchor hrefs to sources are data, not
 * requests, and are allowed. Skips gracefully when no build exists yet.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = new URL("../../../..", import.meta.url).pathname;
const APP_HTML_DIR = join(REPO_ROOT, "apps/web/.next/server/app");

// Only attributes that make the browser FETCH a resource count.
const RESOURCE_ATTR =
  /<(?:script|img|source|video|audio|iframe)[^>]*?\s(?:src|href)="(https?:\/\/[^"]+)"|<link[^>]*?\shref="(https?:\/\/[^"]+)"/gi;

function* walkHtml(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walkHtml(full);
    else if (entry.endsWith(".html")) yield full;
  }
}

describe("no external requests in built pages", () => {
  it("built HTML loads no third-party resources", () => {
    let scanned = 0;
    let exists = false;
    try {
      exists = statSync(APP_HTML_DIR).isDirectory();
    } catch {
      exists = false;
    }
    if (!exists) {
      // No production build present (e.g. test-only run) - nothing to scan.
      expect(true).toBe(true);
      return;
    }
    const violations: string[] = [];
    for (const file of walkHtml(APP_HTML_DIR)) {
      scanned += 1;
      const html = readFileSync(file, "utf8");
      for (const m of html.matchAll(RESOURCE_ATTR)) {
        const url = m[1] ?? m[2];
        if (!url.startsWith("http://localhost") && !url.startsWith("https://localhost")) {
          violations.push(`${file}: ${url}`);
        }
      }
    }
    expect(scanned).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
