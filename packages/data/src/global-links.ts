/**
 * Curated India-impact links between Indian pharma companies and global
 * pharma majors.
 *
 * Each link explains WHY a global company matters to an Indian one:
 * a patent expiry that opens a generics window, a licensing relationship,
 * or direct competition. Shown on company pages ("Global links") and on
 * the Global section pages. Curated by hand — these are structural,
 * slow-moving relationships, not news.
 */
import type { GlobalLink } from "@biocatalyst/types";

export const globalLinks: GlobalLink[] = [
  {
    id: "gl-novo-sun",
    companySlug: "sun-pharma",
    globalCompanySlug: "novo-nordisk",
    kind: "patent_expiry_opportunity",
    title: "Semaglutide patent expiry in India",
    description:
      "Novo Nordisk's semaglutide (Ozempic/Wegovy) patent expiry in India opens a GLP-1 generics window. Sun Pharma is among the Indian majors developing semaglutide generics.",
  },
  {
    id: "gl-novo-drreddys",
    companySlug: "dr-reddys",
    globalCompanySlug: "novo-nordisk",
    kind: "patent_expiry_opportunity",
    title: "Semaglutide patent expiry in India",
    description:
      "Dr. Reddy's is developing semaglutide generics for the post-patent Indian market, where Novo Nordisk's Ozempic/Wegovy defined the GLP-1 category.",
  },
  {
    id: "gl-novo-cipla",
    companySlug: "cipla",
    globalCompanySlug: "novo-nordisk",
    kind: "patent_expiry_opportunity",
    title: "Semaglutide patent expiry in India",
    description:
      "Cipla is positioned for the semaglutide generics opportunity following patent expiry in India.",
  },
  {
    id: "gl-novo-lupin",
    companySlug: "lupin",
    globalCompanySlug: "novo-nordisk",
    kind: "patent_expiry_opportunity",
    title: "Semaglutide patent expiry in India",
    description:
      "Lupin is among the Indian manufacturers targeting semaglutide generics after patent expiry.",
  },
  {
    id: "gl-novo-aurobindo",
    companySlug: "aurobindo-pharma",
    globalCompanySlug: "novo-nordisk",
    kind: "patent_expiry_opportunity",
    title: "Semaglutide patent expiry in India",
    description:
      "Aurobindo's GLP-1 pipeline targets the semaglutide opportunity as Novo Nordisk's Indian patents expire.",
  },
  {
    id: "gl-lilly-sun",
    companySlug: "sun-pharma",
    globalCompanySlug: "eli-lilly",
    kind: "competitor",
    title: "GLP-1 competition: Mounjaro in India",
    description:
      "Eli Lilly launched Mounjaro (tirzepatide) in India in 2025, setting the competitive bar for Indian GLP-1 portfolios including Sun's.",
  },
  {
    id: "gl-lilly-torrent",
    companySlug: "torrent-pharma",
    globalCompanySlug: "eli-lilly",
    kind: "competitor",
    title: "GLP-1 competition: Mounjaro in India",
    description:
      "Lilly's Mounjaro competes directly with Torrent's GLP-1 ambitions (TRP-GLP1) in the Indian diabetes/obesity market.",
  },
  {
    id: "gl-gilead-cipla",
    companySlug: "cipla",
    globalCompanySlug: "gilead",
    kind: "licensing",
    title: "HIV/HCV voluntary licensing",
    description:
      "Cipla manufactures HIV and hepatitis-C medicines under Gilead's voluntary licensing program for low- and middle-income markets.",
  },
  {
    id: "gl-gilead-laurus",
    companySlug: "laurus-labs",
    globalCompanySlug: "gilead",
    kind: "licensing",
    title: "HIV/HCV voluntary licensing (API)",
    description:
      "Laurus Labs supplies antiretroviral APIs under voluntary licences from innovators including Gilead.",
  },
  {
    id: "gl-roche-biocon",
    companySlug: "biocon",
    globalCompanySlug: "roche",
    kind: "competitor",
    title: "Trastuzumab biosimilars vs Herceptin",
    description:
      "Biocon Biologics' trastuzumab biosimilars compete with Roche's Herceptin across global markets.",
  },
  {
    id: "gl-sanofi-biocon",
    companySlug: "biocon",
    globalCompanySlug: "sanofi",
    kind: "competitor",
    title: "Insulin competition",
    description:
      "Biocon is one of Asia's largest insulin producers, competing with Sanofi's insulin franchise in emerging markets.",
  },
  {
    id: "gl-sandoz-sun",
    companySlug: "sun-pharma",
    globalCompanySlug: "sandoz",
    kind: "competitor",
    title: "Global generics rivalry",
    description:
      "Sandoz, the spun-out Novartis generics arm, competes head-to-head with Sun Pharma across US and European generics.",
  },
  {
    id: "gl-sandoz-drreddys",
    companySlug: "dr-reddys",
    globalCompanySlug: "sandoz",
    kind: "competitor",
    title: "Global generics rivalry",
    description:
      "Sandoz competes with Dr. Reddy's across complex generics and biosimilars in regulated markets.",
  },
  {
    id: "gl-abbvie-zydus",
    companySlug: "zydus-lifesciences",
    globalCompanySlug: "abbvie",
    kind: "competitor",
    title: "Adalimumab biosimilars vs Humira",
    description:
      "Zydus launched Exemptia, an early adalimumab biosimilar, competing in the post-Humira (AbbVie) landscape.",
  },
];
