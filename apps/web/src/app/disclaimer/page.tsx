import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Disclaimer — Biocatalyst India",
  description:
    "Biocatalyst India is informational only: not medical advice, not investment advice. Read the full disclaimer.",
};

export default function DisclaimerPage() {
  return (
    <article className="panel" style={{ maxWidth: 760 }}>
      <h1>Disclaimer</h1>
      <p className="muted">Last updated: 2026-09-30.</p>

      <h2>Informational only — not medical advice</h2>
      <p>
        Content on Biocatalyst India describes clinical trials, drugs and
        regulatory actions for information purposes only. It is <strong>not
        medical advice</strong>, does not recommend any diagnosis or treatment,
        and is not a substitute for a qualified healthcare professional.
        Never disregard professional medical advice because of something you
        read here.
      </p>

      <h2>Informational only — not investment advice</h2>
      <p>
        Nothing on this site is investment advice. We do not publish
        buy/sell/hold calls, price targets, return predictions or personalised
        recommendations. Catalyst summaries explain operational relevance (e.g.
        “the result may support a future regulatory submission”) — they never
        predict security prices or tell you what to trade.
      </p>

      <h2>Market reaction is observation, not causation</h2>
      <p>
        “Market reaction” figures show the price movement of a security around
        an event window. They are explicitly <strong>not</strong> a claim that
        the event caused the movement. The exact measurement window and data
        provider are shown on every event. Market data may be delayed.
      </p>

      <h2>Seed fixtures and automated extraction</h2>
      <p>
        Some data is labelled <strong>seed fixtures</strong> — fictional
        records used for development, not real announcements or real market
        data. Other summaries may be produced or assisted by automated
        extraction from source documents; confidence and review status are
        shown where available, and unknown fields are shown as unknown rather
        than guessed. Every event links to its underlying source records —
        always verify material facts against the primary source.
      </p>

      <h2>Corrections</h2>
      <p>
        Factual errors can be reported with <strong>“Report an issue with this
        event”</strong> on any event page. Reports are reviewed by the operator
        before publication of a correction.
      </p>

      <h2>No liability</h2>
      <p>
        You use this information at your own risk. To the maximum extent
        permitted by law, the operator accepts no liability for decisions or
        losses arising from reliance on this content.
      </p>
    </article>
  );
}
