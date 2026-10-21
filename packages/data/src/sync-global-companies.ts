/**
 * Add industry sponsors from ClinicalTrials.gov to the company catalog.
 *
 * The registry is a free, relevant source of real clinical-development
 * organizations. Imports are additive and idempotent: curated profiles are
 * never overwritten and re-running only discovers new sponsors.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { closePool, getPool } from "@biocatalyst/db";

const CTG_API = "https://clinicaltrials.gov/api/v2/studies";
const DESCRIPTION =
  "Industry sponsor with clinical studies registered on ClinicalTrials.gov. Open the company page to see linked catalysts and trials available in BioCatalyst.";

interface CtgResponse {
  studies?: Array<{
    protocolSection?: {
      sponsorCollaboratorsModule?: {
        leadSponsor?: { name?: string; class?: string };
      };
    };
  }>;
  nextPageToken?: string;
}

export interface GlobalCompanySyncResult {
  source: "ClinicalTrials.gov";
  fetchedStudies: number;
  discoveredSponsors: number;
  added: number;
  totalGlobalCompanies: number;
}

function normalizedName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/(incorporated|corporation|company|limited|ltd|inc|llc|plc|ag|sa|gmbh)$/g, "");
}

function slugFor(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  const hash = createHash("sha256").update(name).digest("hex").slice(0, 10);
  return `ctg-${base || "sponsor"}-${hash}`;
}

function isUsableSponsor(name: string): boolean {
  return (
    name.length >= 2 &&
    name.length <= 200 &&
    !name.includes("@") &&
    !/^https?:\/\//i.test(name) &&
    !/^unknown$/i.test(name)
  );
}

async function fetchSponsors(target: number): Promise<{ names: string[]; studies: number }> {
  const names = new Map<string, string>();
  let pageToken: string | undefined;
  let studies = 0;
  // A small buffer absorbs names already present in the curated catalog.
  const wanted = target + 350;
  for (let page = 0; page < 20 && names.size < wanted; page++) {
    const url = new URL(CTG_API);
    url.searchParams.set("query.term", "AREA[LeadSponsorClass]INDUSTRY");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("format", "json");
    url.searchParams.set("fields", "NCTId,LeadSponsor");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, {
      headers: { "User-Agent": "BioCatalystIndia/1.0 (company catalog sync)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`ClinicalTrials.gov returned ${response.status}`);
    const body = (await response.json()) as CtgResponse;
    studies += body.studies?.length ?? 0;
    for (const study of body.studies ?? []) {
      const sponsor = study.protocolSection?.sponsorCollaboratorsModule?.leadSponsor;
      const name = sponsor?.name?.trim();
      if (sponsor?.class !== "INDUSTRY" || !name || !isUsableSponsor(name)) continue;
      const key = normalizedName(name);
      if (key && !names.has(key)) names.set(key, name);
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return { names: [...names.values()], studies };
}

export async function syncGlobalCompanies(
  pool: Pool,
  targetTotal = 1_200,
): Promise<GlobalCompanySyncResult> {
  const existing = await pool.query<{ canonical_name: string; country: string }>(
    `SELECT canonical_name, country FROM companies`,
  );
  const existingNames = new Set(existing.rows.map((r) => normalizedName(r.canonical_name)));
  const currentGlobal = existing.rows.filter((r) => r.country !== "India").length;
  if (currentGlobal >= targetTotal) {
    return {
      source: "ClinicalTrials.gov",
      fetchedStudies: 0,
      discoveredSponsors: 0,
      added: 0,
      totalGlobalCompanies: currentGlobal,
    };
  }

  const needed = targetTotal - currentGlobal;
  const fetched = await fetchSponsors(needed);
  const candidates = fetched.names
    .filter((name) => !existingNames.has(normalizedName(name)))
    .slice(0, needed + 150);
  if (candidates.length === 0) {
    return {
      source: "ClinicalTrials.gov",
      fetchedStudies: fetched.studies,
      discoveredSponsors: fetched.names.length,
      added: 0,
      totalGlobalCompanies: currentGlobal,
    };
  }

  const slugs = candidates.map(slugFor);
  const legacyIds = slugs.map((slug) => `ctgov-${slug.slice(-10)}`);
  const descriptions = candidates.map(() => DESCRIPTION);
  const countries = candidates.map(() => "Global");
  const websites = candidates.map(() => "");
  const inserted = await pool.query(
    `INSERT INTO companies (legacy_id, canonical_name, slug, description, country, website)
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]
     )
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [legacyIds, candidates, slugs, descriptions, countries, websites],
  );
  const total = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM companies WHERE country <> 'India'`,
  );
  return {
    source: "ClinicalTrials.gov",
    fetchedStudies: fetched.studies,
    discoveredSponsors: fetched.names.length,
    added: inserted.rowCount ?? 0,
    totalGlobalCompanies: Number(total.rows[0]?.count ?? currentGlobal),
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const target = targetArg ? Number(targetArg.split("=")[1]) : 1_200;
  if (!Number.isInteger(target) || target < 1 || target > 10_000) {
    throw new Error("--target must be an integer between 1 and 10000");
  }
  const pool = getPool();
  try {
    console.log(JSON.stringify(await syncGlobalCompanies(pool, target)));
  } finally {
    await closePool();
  }
}
