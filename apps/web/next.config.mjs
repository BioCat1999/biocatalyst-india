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
  // The admin ingestion route runs the plain-SQL migration runner at runtime.
  // Those SQL files live outside apps/web, so Next's automatic server trace
  // cannot discover them from the dynamic fs reads in @biocatalyst/db. Include
  // them explicitly in the Vercel function bundle.
  outputFileTracingIncludes: {
    "/api/v1/admin/ingestion/run": [
      "../../packages/db/migrations/**/*.sql",
    ],
  },
  // The workspace packages use TypeScript ESM-style `.js` relative imports
  // (resolving to `.ts` sources). Teach webpack to map them so the
  // tsconfig-paths-mapped `@biocatalyst/data` src bundle resolves.
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};
export default nextConfig;
