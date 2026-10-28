/**
 * Basic security headers (Milestone 8, spec §21).
 *
 * - X-Content-Type-Options: nosniff — stop MIME sniffing.
 * - Referrer-Policy: strict-origin-when-cross-origin — don't leak full URLs.
 * - frame-ancestors 'self' (+ X-Frame-Options: SAMEORIGIN for older browsers)
 *   — the app must not be framed by other sites (clickjacking defence).
 *
 * The CSP is intentionally narrow: no new script/style sources, because the
 * app loads zero third-party resources (no analytics, fonts, or beacons —
 * verified by the no-external-requests test). Only 'self' and the inline
 * handlers Next.js/React emit are needed, so 'unsafe-inline' is allowed for
 * scripts and styles rather than loosening the allow-list.
 */
export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@biocatalyst/types", "@biocatalyst/data"],
  // The workspace packages use TypeScript ESM-style `.js` relative imports
  // (resolving to `.ts` sources). Teach webpack to map them so the
  // tsconfig-paths-mapped `@biocatalyst/data` src bundle resolves.
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    },
  },
  async headers() {
    // `next dev` evaluates code for fast refresh, so the dev server alone
    // allows 'unsafe-eval'. Production headers are unchanged.
    const headers =
      process.env.NODE_ENV === "development"
        ? SECURITY_HEADERS.map((h) =>
            h.key === "Content-Security-Policy"
              ? { ...h, value: h.value.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'") }
              : h,
          )
        : SECURITY_HEADERS;
    return [{ source: "/:path*", headers }];
  },
};
export default nextConfig;
