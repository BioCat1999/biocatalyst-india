import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { SearchForm } from "@/components/SearchForm";
import { AuthNav } from "@/components/AuthNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Biocatalyst India — Pharma & Biotech Catalyst Intelligence",
  description:
    "Chronological feed of India-linked pharma/biotech catalysts with sources, entity linkage and transparent market reaction.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Biocatalyst India", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f2a43",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="wrap topbar-inner">
            <Link className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">
                B
              </span>
              Biocatalyst India
            </Link>
            <nav className="topnav" aria-label="Primary">
              <Link href="/">Feed</Link>
              <Link href="/companies">Companies</Link>
              <Link href="/global">Global</Link>
              <Link href="/ipos">IPOs</Link>
              <Link href="/patents">Patents</Link>
              <Link href="/explore">Explore</Link>
              <Link href="/calendar">Calendar</Link>
              <Link href="/compare">Compare</Link>
              <Link href="/digest">Digest</Link>
              <Link href="/search">Search</Link>
              <Link href="/watchlist">Watchlist</Link>
            </nav>
            <div className="topbar-right">
              <SearchForm />
              <AuthNav />
            </div>
          </div>
        </header>

        <main>
          <div className="wrap">{children}</div>
        </main>

        <footer className="footer">
          <div className="wrap">
            <p>
              <strong>Biocatalyst India</strong> — informational product. Not
              medical advice and not investment advice. No buy/sell/hold calls,
              price targets or personalised recommendations.
            </p>
            <p>
              Events are ingested from public sources and link to their source
              records. Market data may be delayed.
            </p>
            <nav aria-label="Legal">
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/disclaimer">Disclaimer</Link>
            </nav>
          </div>
        </footer>

        <Script id="sw-register" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }`}
        </Script>
      </body>
    </html>
  );
}
