/**
 * Milestone 8 — legal pages render with the required disclaimer copy
 * (spec §21: privacy, terms, disclaimer before launch).
 *
 * Pages are rendered to static HTML (no server needed) and asserted to
 * contain the key phrases: informational-only, not medical advice, not
 * investment advice, data sources, retention, contact.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PrivacyPage, { metadata as privacyMeta } from "./privacy/page.js";
import TermsPage, { metadata as termsMeta } from "./terms/page.js";
import DisclaimerPage, { metadata as disclaimerMeta } from "./disclaimer/page.js";

describe("legal pages", () => {
  it("/privacy renders with key privacy copy", () => {
    expect(privacyMeta.title).toContain("Privacy");
    const html = renderToStaticMarkup(PrivacyPage());
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("no third-party analytics");
    expect(html).toContain("public sources");
    expect(html).toContain("Data retention");
    expect(html).toContain("bio1941999@gmail.com");
  });

  it("/terms renders with key terms copy", () => {
    expect(termsMeta.title).toContain("Terms");
    const html = renderToStaticMarkup(TermsPage());
    expect(html).toContain("Terms of Use");
    expect(html).toContain("not medical advice");
    expect(html).toContain("not investment advice");
    expect(html).toContain("Report an issue");
    expect(html).toContain("Limitation of liability");
  });

  it("/disclaimer renders with key disclaimer copy", () => {
    expect(disclaimerMeta.title).toContain("Disclaimer");
    const html = renderToStaticMarkup(DisclaimerPage());
    expect(html).toContain("Informational only");
    expect(html).toContain("not medical advice");
    expect(html).toContain("not investment advice");
    expect(html).toContain("buy/sell/hold");
    expect(html).toContain("Automated extraction");
  });
});
