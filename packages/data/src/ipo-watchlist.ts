/**
 * IPO tracker catalog — Indian pharma companies in (or recently through)
 * the IPO pipeline.
 *
 * Unlike the listed catalog, the pipeline companies (Claroid, Hindustan
 * Laboratories, Injecto) are unlisted and have NO securities. They are
 * seeded into the companies table by `seed:companies` so ingestion can
 * resolve their names.
 *
 * Status is tracked explicitly here — NOT derived from "has no securities":
 * - Curated initial status/dates below cover milestones that predate
 *   ingestion (e.g. Injecto listed 21 Sep 2026).
 * - Detected GDELT IPO events can only move status forward
 *   (in_pipeline → listed); a stale DRHP story never downgrades a company
 *   that already listed.
 * - Recently listed companies (Rubicon, Symbiotec) stay in the tracker
 *   with status "listed" even though they now have securities.
 *
 * Entries are curated from verified DRHP filings (October 2026). Add new
 * candidates here as DRHPs are filed; news ingestion picks up their IPO
 * milestones via the IPO keyword classifier in the GDELT adapter.
 */
import type { Company } from "@biocatalyst/types";

/** Unlisted IPO-pipeline companies — seeded into the companies table. */
export const ipoCompanySeeds: Company[] = [
  {
    id: "co-claroid-pharma",
    slug: "claroid-pharmaceuticals",
    canonicalName: "Claroid Pharmaceuticals Ltd",
    description:
      "Gujarat-based pharmaceutical formulations manufacturer (tablets, capsules, ointments) focused on exports to semi-regulated markets, particularly Africa. Filed DRHP with SEBI in September 2026 (fresh issue + OFS totalling ~1.26 crore shares) to fund an injectables manufacturing facility in Ahmedabad.",
    country: "India",
    website: "",
    aliases: ["Claroid Pharma", "Claroid Pharmaceuticals"],
    securities: [],
  },
  {
    id: "co-hindustan-labs",
    slug: "hindustan-laboratories",
    canonicalName: "Hindustan Laboratories",
    description:
      "Pharmaceutical company supplying generic medicines, including to government institutions. Filed DRHP with SEBI in January 2026 (fresh issue of up to 50 lakh shares + OFS of up to 91 lakh shares) to fund working-capital requirements.",
    country: "India",
    website: "",
    aliases: ["Hindustan Labs"],
    securities: [],
  },
  {
    id: "co-injecto-polymers",
    slug: "injecto-polymers",
    canonicalName: "Injecto Polymers",
    description:
      "Polymer components manufacturer serving pharma packaging and related industries. IPO opened 11 September 2026 and listed 21 September 2026.",
    country: "India",
    website: "",
    aliases: ["Injecto"],
    securities: [],
  },
];

export type IpoCatalogStatus = "in_pipeline" | "listed";

/**
 * Explicit IPO status catalog, keyed by company slug. Covers both the
 * unlisted pipeline seeds above and recently listed companies that live in
 * the main listed catalog (Rubicon, Symbiotec).
 */
export interface IpoRecord {
  slug: string;
  /** Curated initial status — ingestion events can only advance it. */
  status: IpoCatalogStatus;
  /** DRHP filing date (YYYY-MM) when known. */
  drhpDate?: string;
  /** Listing date (YYYY-MM-DD) when known. */
  listingDate?: string;
  note?: string;
}

export const ipoCatalog: IpoRecord[] = [
  {
    slug: "claroid-pharmaceuticals",
    status: "in_pipeline",
    drhpDate: "2026-09",
    note: "DRHP filed with SEBI in September 2026 (fresh issue + OFS).",
  },
  {
    slug: "hindustan-laboratories",
    status: "in_pipeline",
    drhpDate: "2026-01",
    note: "DRHP filed with SEBI in January 2026 (fresh issue + OFS).",
  },
  {
    slug: "injecto-polymers",
    status: "listed",
    listingDate: "2026-09-21",
    note: "IPO opened 11 September 2026; listed 21 September 2026.",
  },
  {
    slug: "rubicon-research",
    status: "listed",
    note: "Filed DRHP in 2025; listed. Also in the main listed catalog.",
  },
  {
    slug: "symbiotec",
    status: "listed",
    note: "Filed DRHP in 2025; listed. Also in the main listed catalog.",
  },
];
