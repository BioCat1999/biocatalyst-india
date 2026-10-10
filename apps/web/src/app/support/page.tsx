import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support — Biocatalyst India",
  description:
    "Get help with Biocatalyst India: contact the operator, report data issues, and request account deletion.",
};

export default function SupportPage() {
  return (
    <article className="panel" style={{ maxWidth: 760 }}>
      <h1>Support</h1>
      <p className="muted">Biocatalyst India — pharma & biotech catalyst intelligence.</p>

      <h2>Contact</h2>
      <p>
        Email <strong>bio1941999@gmail.com</strong> for account help, billing questions, or
        anything else about the product. We read every message; replies usually land within a
        few days.
      </p>

      <h2>Report a data issue</h2>
      <p>
        Every event page has a <strong>“Report an issue with this event”</strong> action.
        Reports are reviewed by the operator before a correction is published — that is the
        fastest route for fixing a wrong fact, entity link, or source.
      </p>

      <h2>Delete your account</h2>
      <p>
        In the mobile app, open the <strong>Account</strong> tab and choose{" "}
        <strong>Delete account</strong>. Deletion is immediate and permanent: your watchlist,
        alerts, and device push tokens are removed with the account. You can also request
        deletion by emailing the address above.
      </p>

      <h2>Legal</h2>
      <p>
        See the <a href="/privacy">Privacy Policy</a>, <a href="/terms">Terms of Use</a>, and{" "}
        <a href="/disclaimer">Disclaimer</a>. Biocatalyst India is informational only — not
        medical advice and not investment advice.
      </p>
    </article>
  );
}
