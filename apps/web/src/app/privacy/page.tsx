import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Biocatalyst India",
  description:
    "How Biocatalyst India handles your data: what is collected, why, how long it is kept, and how to request correction or deletion.",
};

export default function PrivacyPage() {
  return (
    <article className="panel" style={{ maxWidth: 760 }}>
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: 2026-09-30. Biocatalyst India is an informational product — not medical advice and not investment advice.</p>

      <h2>What we collect and why</h2>
      <ul>
        <li>
          <strong>Account details</strong> (only if you sign up): an email address
          and a password hash, used solely to sign you in so you can keep a
          watchlist and receive in-app alerts. Anonymous users can browse the
          feed and all public pages without an account.
        </li>
        <li>
          <strong>Watchlist and alerts</strong>: the companies and drugs you
          follow, so we can show them back to you and generate your alerts.
        </li>
        <li>
          <strong>Issue reports</strong>: if you use “Report an issue with this
          event”, we store the category, description, the event it refers to,
          and any contact detail you voluntarily provide. Reports are reviewed
          by the operator and used to correct data.
        </li>
        <li>
          <strong>Device push tokens</strong> (mobile app, only if you enable
          notifications): the token your device issues is stored on your
          device and registered with our server so we can send you alerts
          about the companies, drugs and trials you follow. It is never sent
          to any third party.
        </li>
        <li>
          <strong>Server logs</strong>: requests carry your IP address, which is
          used only for abuse protection (per-IP rate limiting) and basic
          operational logs.
        </li>
      </ul>

      <h2>What we do NOT collect</h2>
      <p>
        There is no third-party analytics, no advertising beacons, no tracking
        cookies and no embedded social widgets. The app does not phone home to
        any analytics or crash-reporting vendor. (See also: the service worker
        caches app assets on your device only, so pages can load offline.)
      </p>

      <h2>Data sources and fixture status</h2>
      <p>
        Event, company, drug, trial and market data shown in the product comes
        from public sources (stock-exchange disclosures, trial registries,
        publisher abstracts) or from <strong>seed fixtures</strong> used for
        development, clearly labelled as such. Every event links to its
        underlying source record. Corrections submitted through the issue-report
        mechanism are reviewed before publication.
      </p>

      <h2>Data retention</h2>
      <ul>
        <li>Operational server logs: 30 days, then deleted.</li>
        <li>
          Issue reports: kept until triaged and resolved; resolved reports are
          retained in an anonymised audit trail (contact details removed).
        </li>
        <li>
          Account data (watchlists, alerts, credentials, device push tokens):
          kept while your account exists. Deleting your account removes them.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You may request a copy of the data we hold about you, request
        correction of inaccurate event data (use “Report an issue” on any event
        page), or request deletion of your account and its data, by contacting
        us at <strong>bio1941999@gmail.com</strong>.
      </p>

      <h2>Changes</h2>
      <p>
        Material changes to this policy will be announced in the product before
        they take effect.
      </p>
    </article>
  );
}
