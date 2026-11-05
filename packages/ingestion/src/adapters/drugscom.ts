/**
 * Drugs.com news adapter — live ingestion source (no API keys).
 *
 * Why this exists: global pharma companies (Moderna, Pfizer, Lilly…)
 * mostly publish on Business Wire or their own sites, which block
 * automated clients, and GDELT is heavily rate-limited. Drugs.com
 * republishes those companies' own press releases in topic feeds, and
 * each item's description opens with the original release, naming the
 * issuer ("CAMBRIDGE, Mass., Oct. 30, 2026 /BUSINESS WIRE/ -- Moderna…").
 *
 * Feed verification (2026-11-05, live checks with our User-Agent): each
 * feed returns HTTP 200 with 40 dated items, spanning weeks to months, so
 * a daily poll does not miss items:
 *   - New drug approvals   (~6 weeks)
 *   - New drug applications (~4 months)
 *   - Clinical trial results (~3 weeks)
 * The general medical-news and FDA-alert feeds were left out: they rarely
 * name a tracked company.
 *
 * Parsing, attribution, classification and confidence are shared with the
 * PR Newswire adapter (headline first, then the release's opening; items
 * naming no tracked company are dropped, never guessed).
 */
import { PrNewswireAdapter, type WireSourceConfig } from "./prnewswire.js";

export const DRUGSCOM_SOURCE_NAME = "drugs-com";

export const DRUGSCOM_FEEDS: string[] = [
  "https://www.drugs.com/feeds/new_drug_approvals.xml",
  "https://www.drugs.com/feeds/new_drug_applications.xml",
  "https://www.drugs.com/feeds/clinical_trials.xml",
];

const DRUGSCOM_CONFIG: WireSourceConfig = {
  sourceName: DRUGSCOM_SOURCE_NAME,
  publisher: "Drugs.com",
  feeds: DRUGSCOM_FEEDS,
  // Feeds hold weeks of items; take them all on the first run.
  firstRunLookbackDays: 45,
};

export class DrugsComAdapter extends PrNewswireAdapter {
  constructor(fetchImpl?: typeof fetch, feeds?: string[]) {
    super(fetchImpl, feeds, DRUGSCOM_CONFIG);
  }
}
