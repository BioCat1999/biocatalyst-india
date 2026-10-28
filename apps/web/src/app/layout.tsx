import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { SearchForm } from "@/components/SearchForm";
import { AuthNav } from "@/components/AuthNav";
import { BottomNav, TopNav } from "@/components/NavLinks";
import "./globals.css";
import "./design.css";

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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </span>
              <span>Biocatalyst <em>India</em></span>
            </Link>
            <TopNav />
            <div className="topbar-right">
              <SearchForm />
              <AuthNav />
            </div>
          </div>
        </header>

        <main>
          <div className="wrap">{children}</div>
        </main>
        <BottomNav />

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
