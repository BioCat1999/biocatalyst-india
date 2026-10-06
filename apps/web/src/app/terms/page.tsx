import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — Biocatalyst India",
  description:
    "The terms under which you may use Biocatalyst India: informational purpose, acceptable use, no warranties, liability limits.",
};

export default function TermsPage() {
  return (
    <article className="panel" style={{ maxWidth: 760 }}>
      <h1>Terms of Use</h1>
      <p className="muted">Last updated: 2026-09-30.</p>

      <h2>What this product is</h2>
      <p>
        Biocatalyst India is an <strong>informational</strong> intelligence
        product about India-linked pharmaceutical and biotechnology catalysts:
        clinical trials, regulatory actions, company announcements and the
        market reaction around them. It is not medical advice and not investment
        advice (see the <a href="/disclaimer">Disclaimer</a>).
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>
          Do not abuse the service: no scraping at rates that degrade it, no
          attempts to bypass rate limits or admin protections, no submission of
          spam or knowingly false correction reports.
        </li>
        <li>
          Accounts are for personal, non-commercial use unless otherwise agreed
          with the operator.
        </li>
        <li>
          You are responsible for keeping your credentials confidential.
        </li>
      </ul>

      <h2>Data accuracy and corrections</h2>
      <p>
        Event summaries are extracted from public source records, each of which
        is linked on the event page. Summaries may be produced or assisted by
        automated extraction; confidence scores and review status are shown
        where available. If you spot an error, use <strong>“Report an issue
        with this event”</strong> on any event page — reports are reviewed by
        the operator before any correction is published.
      </p>

      <h2>Market data</h2>
      <p>
        Market-reaction figures are simple observed price movements around an
        event window, with the measurement window and provider shown. They do
        not imply the event caused the movement. Data may be delayed and is for
        informational context only.
      </p>

      <h2>No warranties</h2>
      <p>
        The service is provided “as is”, without warranties of any kind,
        express or implied, including accuracy, completeness, timeliness or
        fitness for a particular purpose.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, the operator is not liable for
        any loss arising from your use of, or reliance on, the information
        provided — including trading, investment or medical decisions made on
        the basis of it.
      </p>

      <h2>Changes and contact</h2>
      <p>
        These terms may change; continued use after changes take effect
        constitutes acceptance. Contact:{" "}
        <strong>bio1941999@gmail.com</strong>.
      </p>
    </article>
  );
}
