/**
 * PubMed fixture adapter — Milestone 7, source #3.
 *
 * This is a FIXTURE-BASED MOCK of a PubMed-indexed journal-article feed
 * (spec §7 lists PubMed as a candidate source; E-utilities is a documented
 * free API, but fixtures keep this milestone offline-first and
 * deterministic). It makes NO network requests: it loads hand-curated
 * records from `adapters/fixtures/pubmed/*.json` that resemble real
 * PubMed records but are fictional (fictional PMIDs, journals, authors).
 *
 * Coverage: scientific_publication events for trial readouts linked to
 * existing canonical drugs/trials. Every fixture carries a `trial_id` that
 * resolves against the canonical catalog; one record (DRL-Denosumab Phase 3)
 * is the M7 cross-source dedupe pair with the BSE announcement of the same
 * readout — both set the same trial-anchored `crossSourceKey`, so the
 * runner merges them into ONE event with both sources linked.
 *
 * `fetchSince` filters on `published_at`; the cursor is an ISO-8601 string.
 * `normalize` maps the record's structured fields to a NormalizedCandidate
 * using deterministic templates — unknown shapes map to null, never guessed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  Cursor,
  NormalizedCandidate,
  RawSourceDocument,
  SourceAdapter,
} from "../adapter.js";
import {
  TEMPLATE_CONFIDENCE,
  asText,
  canonicalizeUrl,
  contentHash,
  crossSourceKey,
  eventFingerprint,
  isoDatePart,
  parseIso,
} from "../normalize.js";

/** Raw shape of one PubMed fixture record. */
export interface PubmedRecord {
  record_type?: unknown;
  pmid?: unknown;
  journal?: unknown;
  article_title?: unknown;
  abstract?: unknown;
  authors?: unknown;
  publication_date?: unknown;
  published_at?: unknown;
  sponsor_name?: unknown;
  drug_name?: unknown;
  indication?: unknown;
  trial_id?: unknown;
  source_url?: unknown;
}

const DEFAULT_FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "pubmed",
);

const PUBLISHER = "PubMed (fixture)";
const EVENT_TYPE = "scientific_publication";

/** Parse a trial id into a registry-qualified ref; null when unparseable. */
function parseTrialRef(trialId: string | null): { registry: string; registryTrialId: string } | null {
  if (!trialId) return null;
  if (trialId.startsWith("CTRI/")) return { registry: "CTRI", registryTrialId: trialId };
  if (/^NCT\d{8}$/.test(trialId)) return { registry: "ClinicalTrials.gov", registryTrialId: trialId };
  return null;
}

export class PubmedFixtureAdapter implements SourceAdapter {
  readonly sourceName: string = "pubmed-fixture";
  private readonly fixtureDir: string;
  private docs: RawSourceDocument[] | null = null;
  private lastCursor: Cursor = "";

  /** `fixtureDir` is injectable so tests can supply edge-case records. */
  constructor(fixtureDir?: string) {
    this.fixtureDir = fixtureDir ?? DEFAULT_FIXTURE_DIR;
  }

  private loadDocs(): RawSourceDocument[] {
    if (this.docs) return this.docs;
    const retrievedAt = new Date().toISOString();
    const files = readdirSync(this.fixtureDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    const docs: RawSourceDocument[] = [];
    for (const file of files) {
      let record: PubmedRecord;
      try {
        record = JSON.parse(readFileSync(join(this.fixtureDir, file), "utf8")) as PubmedRecord;
      } catch {
        continue; // corrupt fixture file — skip, never crash ingestion
      }
      const url = asText(record.source_url);
      const pmid = asText(record.pmid);
      if (!url || !pmid) continue; // no identity → cannot dedupe; skip
      let canonicalUrl: string;
      try {
        canonicalUrl = canonicalizeUrl(url);
      } catch {
        continue;
      }
      const publishedAt = parseIso(record.published_at) ?? parseIso(record.publication_date);
      docs.push({
        sourceName: this.sourceName,
        canonicalUrl,
        contentHash: contentHash(record),
        retrievedAt,
        publishedAt,
        raw: record,
      });
    }
    docs.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
    this.docs = docs;
    return docs;
  }

  async fetchSince(cursor: Cursor): Promise<RawSourceDocument[]> {
    const docs = this.loadDocs().filter((d) => (d.publishedAt ?? "") > cursor);
    const newest = docs.length ? (docs[docs.length - 1].publishedAt ?? "") : cursor;
    this.lastCursor = newest > cursor ? newest : cursor;
    return docs;
  }

  getNextCursor(): Cursor {
    return this.lastCursor;
  }

  async normalize(doc: RawSourceDocument): Promise<NormalizedCandidate[]> {
    const r = doc.raw as PubmedRecord;
    if (!r || typeof r !== "object") return [];

    const pmid = asText(r.pmid);
    const journal = asText(r.journal);
    const title = asText(r.article_title);
    const sponsor = asText(r.sponsor_name);
    const drug = asText(r.drug_name);
    const indication = asText(r.indication);
    const trialId = asText(r.trial_id);

    const occurredAt = parseIso(r.published_at) ?? parseIso(r.publication_date);
    const date = doc.publishedAt ? doc.publishedAt.slice(0, 10) : "an unknown date";

    const headline =
      title && journal
        ? `New publication: "${title}" (${journal}${pmid ? `, PMID ${pmid}` : ""})`
        : (title ?? `PubMed article ${pmid ?? ""}`);

    const factualSummary =
      title && journal && sponsor
        ? (
            `${sponsor} is listed as the sponsor of record for the study underlying ` +
            `"${title}", published in ${journal} on ${date}${pmid ? ` (PMID ${pmid})` : ""}. ` +
            `The article concerns ${drug ?? "an investigational program"}` +
            `${indication ? ` for ${indication}` : ""}` +
            `${trialId ? `; the linked trial is ${trialId}` : ""}.`
          )
        : headline;

    const trialRef = parseTrialRef(trialId);

    return [
      {
        sourceName: this.sourceName,
        canonicalUrl: doc.canonicalUrl,
        contentHash: doc.contentHash,
        retrievedAt: doc.retrievedAt,
        publishedAt: doc.publishedAt,
        eventType: EVENT_TYPE,
        occurredAt, // null when no usable date — runner rejects
        headline,
        factualSummary,
        catalystSummary:
          "A scientific publication makes detailed results available for independent review. " +
          "Peer discussion and any follow-up studies are the next observable steps. Not investment advice.",
        confidence: TEMPLATE_CONFIDENCE,
        indication,
        phase: null, // journal records carry no structured phase
        outcome: null, // never inferred from publication prose (spec §8.3)
        trialRefs: trialRef ? [trialRef] : [],
        companyNames: sponsor ? [sponsor] : [],
        drugNames: drug ? [drug] : [],
        sourceTitle: title ?? headline,
        publisher: PUBLISHER,
        isPrimary: true,
        fingerprint: eventFingerprint({
          sourceName: this.sourceName,
          eventType: EVENT_TYPE,
          occurredDate: occurredAt ? isoDatePart(occurredAt) : "unknown",
          trialKey: trialRef ? `${trialRef.registry}/${trialRef.registryTrialId}` : undefined,
          entityKey: drug ?? sponsor ?? undefined,
        }),
        // Trial-anchored cross-source dedupe (M7): the same readout filed
        // with the exchange and published in a journal merges into one event.
        crossSourceKey: trialRef ? crossSourceKey(trialRef) : null,
        rawSnapshot: r,
      },
    ];
  }
}
