# Brief: plain-English "What this means" card and importance tag

Written 2026-11-11 for an agent picking this up with no prior context.

## Goal

A reader with no pharma background should be able to look at any event and
understand three things in plain words: what happened, why it matters, and
what happens next. They should also see at a glance whether the event is a
big deal or routine.

Today every event shows a "Why it matters" paragraph, but it is one fixed
template per event type, written in industry language ("A regulatory
submission starts a formal review process…"). It reads the same for a
Phase 1 start and a pivotal Phase 3 result, and it never explains terms
like "primary endpoint" or "topline".

Two examples of what readers currently cannot decode:

- "Moderna announces Phase 3 results" — a reader does not know that Phase 3
  is the last and largest test before a company can ask for approval.
- "Trial reaches its 80th death" (an event-driven cancer trial) — this
  sounds like bad news. It actually means the pre-agreed number of events
  has been reached, so the final analysis can now be run and the pass/fail
  result is close.

## What to build

1. An **explainer** for every event: three short plain-English lines.
2. An **importance** level for every event: `high`, `medium` or `routine`.
3. Both shown on the web and mobile feed cards and event detail screens.

Both are computed by one pure, deterministic function at read time. There
is no model call, no API key, no database migration and no backfill, so
all existing events get them the moment the change deploys.

## Background you need

- Monorepo (pnpm + turbo). Read `AGENTS.md` at the repo root before
  touching any turbo config or commands.
- `packages/types/src/index.ts` holds the shared types `CatalystEvent`
  (detail) and `EventCard` (feed), the `EVENT_TYPES` list, and pure helpers
  such as `eventTypeLabel`. Web, mobile, data and extraction all import it.
- `packages/data/src/index.ts` maps database rows to `CatalystEvent`
  (the `rows.map(...)` block around line 400) and to `EventCard`
  (`toEventCards`, around line 1409).
- `packages/api-client/src/schemas.ts` has the zod schemas the mobile app
  uses to parse API responses (`eventCardSchema`, `catalystEventSchema`).
- Web UI: `apps/web/src/components/EventCard.tsx`,
  `apps/web/src/app/events/[id]/page.tsx`, styles in
  `apps/web/src/app/design.css` (`.ev-why`, `.ev-chip`).
- Mobile UI: `apps/mobile/src/components/EventCard.tsx`,
  `apps/mobile/src/screens/EventDetailScreen.tsx`, colours in
  `apps/mobile/src/theme.ts`.
- The stored `catalyst_summary` text comes from `buildCatalystSummary` in
  `packages/extraction/src/summaries.ts`. Leave it and the database column
  alone; other code and tests depend on it.
- `packages/extraction/src/summaries.ts` exports `INVESTMENT_PHRASES` and
  `containsInvestmentLanguage`. The product rule (spec §6) is "explain the
  event, not predict the security". Words such as buy, sell, hold, upside,
  downside, returns, "share price" and "stock price" are banned in
  generated text.

## Step 1: the pure function

Create `packages/types/src/explain.ts` and export it from
`packages/types/src/index.ts`.

```ts
export type Importance = "high" | "medium" | "routine";

export interface EventExplainer {
  /** What happened, in one plain sentence. */
  whatHappened: string;
  /** Why a reader should care, in one or two plain sentences. */
  whyItMatters: string;
  /** The next thing to watch for, in one sentence. */
  whatNext: string;
}

export interface ExplainInput {
  eventType: EventType;
  headline: string;
  phase?: TrialPhase;
  outcome?: Outcome;
}

export function explainEvent(input: ExplainInput): EventExplainer;
export function eventImportance(input: ExplainInput): Importance;
export function importanceLabel(i: Importance): string; // "Major", "Notable", "Routine"
```

Check the real `TrialPhase` values in `index.ts` before writing the phase
logic.

### Writing rules for the explainer text

- Write for a reader aged 15 with no science background. Short sentences.
  Each field is at most about 30 words.
- No undefined jargon. If a term is unavoidable, explain it in the same
  sentence, for example "the main goal the trial was designed to test
  (its primary endpoint)".
- Describe what the event means for the drug and the company. Never say
  anything about the stock, the price, or what a reader should do. Every
  output must pass `containsInvestmentLanguage` (see Step 5).
- Do not claim facts the event does not carry. When `outcome` is `unknown`
  or missing, say the result is not stated; do not imply success.
- Do not repeat the headline. `whatHappened` explains the kind of event.

### Base text per event type

Write one base explainer for each of the 19 values in `EVENT_TYPES`. The
TypeScript `Record<EventType, …>` type should force full coverage. Vary the
trial entries by phase:

| Phase | Plain meaning to use |
|---|---|
| Phase 1 | first tests in a small group of people, mainly checking safety |
| Phase 2 | a mid-sized test of whether the drug works and at what dose |
| Phase 3 | the last and largest test before a company can ask for approval |
| Phase 4 | a study after the drug is already on sale |

Example of the tone wanted, for `clinical_trial_result` with Phase 3 and an
unknown outcome:

- whatHappened: "Results are out from a Phase 3 trial, the last and largest
  test a drug goes through before a company can ask regulators to approve
  it."
- whyItMatters: "This is usually the result that decides whether a drug
  moves forward. The source does not state whether the trial met its main
  goal."
- whatNext: "Watch for the full data and for the company to say whether it
  will file for approval."

### Headline nuance rules

After picking the base text, check the lower-cased headline against these
patterns and override the relevant lines. First match wins. Match whole
words or phrases, not substrings inside other words.

| Headline contains | What to explain |
|---|---|
| "topline" / "top-line" | A first summary of the main result; full data comes later. |
| "interim analysis" / "interim results" | An early look while the trial is still running; not the final answer. |
| "final analysis", or a number followed by "event(s)" or "death(s)" with "trial"/"study"/"analysis" | An event-driven trial: the analysis runs once a pre-set number of events is reached. Reaching the number means the result is close; it is not itself good or bad news. |
| "primary endpoint" | The main goal the trial was designed to test. |
| "breakthrough therapy", "fast track", "priority review", "orphan drug" | A regulator label that speeds up or supports review. It is not an approval. |
| "accelerated approval" | Approval on early evidence; the company must still confirm the benefit in a later trial. |
| "complete response letter" / "crl" | The regulator has declined to approve the application in its current form and has said what must be fixed. |
| "chmp" / "positive opinion" / "advisory committee" | An expert panel's recommendation. The regulator usually, but not always, follows it. |
| "new indication" / "label expansion" | An already-approved drug cleared for an additional disease or patient group. |
| "anda" / "generic" | Clearance to sell a copy of an existing drug, usually at a lower price. |
| "biosimilar" | A near-copy of an existing biologic drug. |
| "recall" | The company is pulling specific batches from the market. |

Keep the rules in one ordered array of `{ test, apply }` objects so adding
a rule later is a one-entry change.

### Importance rules

| Level | Events |
|---|---|
| `high` | `primary_endpoint_met`, `primary_endpoint_missed`, `regulatory_rejection_or_deficiency`, `acquisition_or_divestiture`, `safety_signal`; `clinical_trial_result` in Phase 3 (or Phase 2/3); `regulatory_approval` unless the headline matches the generic/ANDA rule |
| `medium` | `regulatory_submission`, `regulatory_committee_update`, `licensing_or_partnership`, `manufacturing_or_inspection_update`, `securities_regulatory_action`, `ipo_filing`, `ipo_listing`; `clinical_trial_result` in other or unknown phases; `clinical_trial_started` in Phase 3; `regulatory_approval` for a generic/ANDA |
| `routine` | `clinical_trial_status_changed`, `scientific_publication`, `company_pipeline_update`, `drug_shortage`; `clinical_trial_started` in other phases |

A headline matching the event-driven "final analysis" rule raises the
level to at least `medium`.

## Step 2: add the fields to the API

In `packages/types/src/index.ts`, add to both `CatalystEvent` and
`EventCard`:

```ts
explainer: EventExplainer;
importance: Importance;
```

In `packages/data/src/index.ts`, fill both fields where rows become
`CatalystEvent` (the `rows.map` block) and carry them through in
`toEventCards`. Compute them from `eventType`, `headline`, `phase` and
`outcome`. Search for other places that build these two shapes by hand
(seed data, search results, tests) and fill the fields there too; the
TypeScript compiler will point them out.

In `packages/api-client/src/schemas.ts`, add both fields to
`eventCardSchema` and `catalystEventSchema` as **optional**. Installed
mobile builds and cached offline responses must keep parsing.

## Step 3: web UI

`apps/web/src/components/EventCard.tsx`:

- Replace the current "Why it matters: {catalystSummary}" line with
  `explainer.whyItMatters`, keeping the zap icon and the `.ev-why` style.
- Add an importance pill in the card header next to the event type.
  `high` gets a filled accent style, `medium` an outlined style, `routine`
  a muted style. Use `importanceLabel` for the text. Add the styles to
  `design.css` using the existing colour variables; do not add new colours
  unless none fits.

`apps/web/src/app/events/[id]/page.tsx`:

- Replace the "Why this matters" panel with a "What this means" panel
  holding three labelled rows: "What happened", "Why it matters", "What
  happens next". Keep the existing line "Neutral catalyst context — not
  investment advice."
- Show the importance pill near the title.
- Keep `catalystSummary` out of the page; the new panel replaces it.

Check both at phone width (375px) and desktop, in the built-in browser.

## Step 4: mobile UI

`apps/mobile/src/components/EventCard.tsx` and
`apps/mobile/src/screens/EventDetailScreen.tsx`: mirror the web changes.
Because the fields are optional in the API schema, fall back to the
existing `catalystSummary` rendering when `explainer` is missing, and hide
the pill when `importance` is missing.

This is a code change only. Do not bump the app version, build a release
or touch the Play Store listing.

## Step 5: tests

- Unit tests for `explain.ts`. Check whether `packages/types` already has
  a test setup; if it does not, put the tests in `packages/extraction`
  (it already imports from types and owns the banned-phrase guard).
  Cover:
  - every event type returns three non-empty lines;
  - every explainer for every event type × phase × outcome combination,
    and every nuance rule, passes `containsInvestmentLanguage` (returns
    null);
  - each field is 30 words or fewer;
  - the phase wording differs between Phase 1 and Phase 3;
  - an unknown outcome never produces text claiming success;
  - each nuance rule fires on a realistic headline, including
    "Trial reaches 80th event, triggering final analysis", and does not
    fire on a look-alike (for example "standard" must not match "anda");
  - the importance table above, row by row.
- Update existing tests and fixtures that construct `CatalystEvent` or
  `EventCard` so they compile.
- Run from the repo root: `pnpm typecheck` and `pnpm test`. The DB-backed
  suites need the local Postgres from `pnpm db:setup`. The web test
  `no-external-requests` needs a production build first:
  `DATABASE_URL=postgresql://biocatalyst:biocatalyst@localhost:5432/biocatalyst_dev pnpm --filter @biocatalyst/web run build`.

## Constraints

- Do not read or modify `apps/web/.env.local`. It belongs to production.
- Do not write to the production database, and do not add a migration.
- Do not add a model/LLM call or any new dependency.
- Do not change `catalyst_summary`, `buildCatalystSummary`, the ingestion
  adapters or the GitHub workflows.
- Work on a branch and open a pull request against `main`. Pushing to
  `main` deploys to production, so do not push there directly.

## Done when

- `pnpm typecheck` and `pnpm test` pass.
- On web and mobile, every feed card shows an importance pill and a
  plain-English "why it matters" line, and every event detail screen shows
  the three-row "What this means" panel.
- A Phase 3 result, a generic approval, a trial status change and an
  event-driven "final analysis" headline each read sensibly to someone
  with no pharma background. Paste those four rendered explainers into
  the pull request description so the owner can judge the wording.

## Not in this task

These were discussed and deliberately left for later:

- AI-written, event-specific explainers. The project has no model provider
  wired (`docs/decisions.md`, "M4 — No real model API"); adding one is a
  cost and key-management decision for the owner.
- "Stakes for the company" (lead drug versus one of many programs).
- Historical odds ("about half of Phase 3 trials succeed") and "how
  similar events moved in the past".
- A drug-journey progress bar, a tap-to-explain glossary, and a feed
  filter by importance.
