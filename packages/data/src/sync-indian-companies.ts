/** Add verified Indian life-sciences legal entities from the GLEIF registry. */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { closePool, getPool } from "@biocatalyst/db";

const GLEIF_API = "https://api.gleif.org/api/v1/lei-records";
const SEARCH_TERMS = [
  "pharma",
  "biotech",
  "lifesciences",
  "laboratories",
  "therapeutics",
  "medical",
  "healthcare",
  "drugs",
] as const;
const DESCRIPTION =
  "India-registered life-sciences organization verified through the GLEIF legal-entity registry.";

interface GleifRecord {
  attributes?: {
    lei?: string;
    entity?: {
      legalName?: { name?: string };
      legalAddress?: { country?: string };
      status?: string;
    };
  };
}

interface GleifResponse {
  data?: GleifRecord[];
  meta?: { pagination?: { lastPage?: number } };
}

interface Candidate {
  lei: string;
  name: string;
}

export interface IndianCompanySyncResult {
  source: "GLEIF";
  fetchedRecords: number;
  discoveredCompanies: number;
  added: number;
  totalIndianCompanies: number;
}

function normalizedName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/(private|pvt|public|limited|ltd|incorporated|corporation|company|inc|llp)$/g, "");
}

function slugFor(name: string, lei: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  const hash = createHash("sha256").update(lei).digest("hex").slice(0, 10);
  return `india-${base || "company"}-${hash}`;
}

async function fetchCandidates(target: number): Promise<{ candidates: Candidate[]; fetched: number }> {
  const found = new Map<string, Candidate>();
  let fetched = 0;
  const wanted = target + 300;
  for (const term of SEARCH_TERMS) {
    for (let page = 1; page <= 20 && found.size < wanted; page++) {
      const url = new URL(GLEIF_API);
      url.searchParams.set("filter[entity.legalAddress.country]", "IN");
      url.searchParams.set("filter[entity.status]", "ACTIVE");
      url.searchParams.set("filter[entity.legalName]", term);
      url.searchParams.set("page[size]", "200");
      url.searchParams.set("page[number]", String(page));
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.api+json",
          "User-Agent": "BioCatalystIndia/1.0 (company catalog sync)",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`GLEIF returned ${response.status}`);
      const body = (await response.json()) as GleifResponse;
      fetched += body.data?.length ?? 0;
      for (const record of body.data ?? []) {
        const lei = record.attributes?.lei?.trim();
        const entity = record.attributes?.entity;
        const name = entity?.legalName?.name?.trim();
        if (!lei || !name || entity?.legalAddress?.country !== "IN" || entity.status !== "ACTIVE") {
          continue;
        }
        const key = normalizedName(name);
        if (key && !found.has(key)) found.set(key, { lei, name });
      }
      const lastPage = body.meta?.pagination?.lastPage ?? page;
      if (page >= lastPage || (body.data?.length ?? 0) === 0) break;
    }
    if (found.size >= wanted) break;
  }
  return { candidates: [...found.values()], fetched };
}

export async function syncIndianCompanies(
  pool: Pool,
  targetTotal = 1_200,
): Promise<IndianCompanySyncResult> {
  const existing = await pool.query<{ canonical_name: string; country: string }>(
    `SELECT canonical_name, country FROM companies`,
  );
  const existingNames = new Set(existing.rows.map((row) => normalizedName(row.canonical_name)));
  const currentIndian = existing.rows.filter((row) => row.country === "India").length;
  if (currentIndian >= targetTotal) {
    return {
      source: "GLEIF",
      fetchedRecords: 0,
      discoveredCompanies: 0,
      added: 0,
      totalIndianCompanies: currentIndian,
    };
  }

  const needed = targetTotal - currentIndian;
  const fetched = await fetchCandidates(needed);
  const candidates = fetched.candidates
    .filter((candidate) => !existingNames.has(normalizedName(candidate.name)))
    .slice(0, needed + 150);
  if (candidates.length === 0) {
    return {
      source: "GLEIF",
      fetchedRecords: fetched.fetched,
      discoveredCompanies: fetched.candidates.length,
      added: 0,
      totalIndianCompanies: currentIndian,
    };
  }

  const inserted = await pool.query(
    `INSERT INTO companies (legacy_id, canonical_name, slug, description, country, website)
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]
     )
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      candidates.map((candidate) => `gleif-${candidate.lei}`),
      candidates.map((candidate) => candidate.name),
      candidates.map((candidate) => slugFor(candidate.name, candidate.lei)),
      candidates.map(() => DESCRIPTION),
      candidates.map(() => "India"),
      candidates.map(() => ""),
    ],
  );
  const total = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM companies WHERE country = 'India'`,
  );
  return {
    source: "GLEIF",
    fetchedRecords: fetched.fetched,
    discoveredCompanies: fetched.candidates.length,
    added: inserted.rowCount ?? 0,
    totalIndianCompanies: Number(total.rows[0]?.count ?? currentIndian),
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
    console.log(JSON.stringify(await syncIndianCompanies(pool, target)));
  } finally {
    await closePool();
  }
}
