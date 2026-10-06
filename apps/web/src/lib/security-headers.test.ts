/**
 * Milestone 8 — security headers are present in next.config (spec §21).
 */
import { describe, expect, it } from "vitest";
import config, { SECURITY_HEADERS } from "../../next.config.mjs";

describe("security headers", () => {
  it("exports the required headers", () => {
    const keys = SECURITY_HEADERS.map((h: { key: string }) => h.key);
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("Content-Security-Policy");
  });

  it("X-Content-Type-Options is nosniff", () => {
    const h = SECURITY_HEADERS.find((x: { key: string }) => x.key === "X-Content-Type-Options");
    expect(h).toBeDefined();
    expect(h!.value).toBe("nosniff");
  });

  it("CSP includes frame-ancestors 'self' and stays same-origin", () => {
    const h = SECURITY_HEADERS.find(
      (x: { key: string }) => x.key === "Content-Security-Policy",
    );
    expect(h).toBeDefined();
    expect(h!.value).toContain("frame-ancestors 'self'");
    expect(h!.value).toContain("default-src 'self'");
    // No third-party origins anywhere in the policy (no analytics/CDN/fonts).
    const origins = h!.value.match(/https?:\/\/[^\s;]+/g) ?? [];
    expect(origins).toEqual([]);
  });

  it("next.config headers() applies them to every path", async () => {
    // headers is optional in the NextConfig type; assert it exists (it does at
    // runtime) before invoking so tsc is satisfied.
    expect(config.headers).toBeDefined();
    const rules = (await config.headers!()) as {
      source: string;
      headers: { key: string; value: string }[];
    }[];
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    const keys = rules[0].headers.map((h) => h.key);
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Referrer-Policy");
  });
});
