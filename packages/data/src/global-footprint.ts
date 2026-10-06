/**
 * Curated "Global footprint" summaries for leading Indian pharma companies.
 *
 * Keyed by company slug; merged into Company objects by the data layer
 * (`getCompany` / `listCompanies`). Kept as an overlay (not in seed.ts) so
 * the additive seeder stays insert-only for existing rows.
 *
 * Conservative, structural facts only: major foreign markets, key
 * subsidiaries, FDA-inspected manufacturing. Figures are approximate and
 * phrased as such.
 */
export const globalFootprints: Record<string, string> = {
  "sun-pharma":
    "The US is Sun's largest market, anchored by subsidiary Taro Pharmaceutical (US-listed). Significant operations across the US, Europe, Japan and emerging markets, with multiple USFDA-inspected manufacturing sites.",
  "dr-reddys":
    "North America contributes roughly two-fifths of revenue via US generics and the biosimilars pipeline; also present across Europe, Russia/CIS and emerging markets, with USFDA-inspected API and formulation plants.",
  "cipla":
    "Key markets include the US (complex generics, notably respiratory), South Africa and India; USFDA-inspected plants in Goa and Indore.",
  lupin:
    "Major US generics presence including complex injectables and inhalation products; manufacturing sites in India and the US inspected by the USFDA.",
  "aurobindo-pharma":
    "The US is the largest market (around half of revenue), led by subsidiary Eugia's injectables; one of India's largest USFDA-approved manufacturing networks.",
  biocon:
    "Biocon Biologics markets biosimilars across the US and EU (following the Viatris biosimilars acquisition); Syngene is a global CRDMO serving foreign innovators.",
  "zydus-lifesciences":
    "US generics business plus the consumer wellness arm; early adalimumab biosimilar (Exemptia) launched in India.",
  "torrent-pharma":
    "Operations across India, the US, Brazil and Germany; branded generics focus with a GLP-1 pipeline (TRP-GLP1) targeting diabetes/obesity.",
  "divis-laboratories":
    "API and custom-synthesis supplier to global innovators; exports account for the large majority of revenue, with USFDA-inspected plants.",
  "glenmark-pharma":
    "US generics via Glenmark USA plus an innovation arm (Ichnos Glenmark Innovation) developing novel biologics globally.",
};
