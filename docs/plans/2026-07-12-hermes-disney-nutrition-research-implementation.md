# Hermes Disney Nutrition Research Worker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give Hermes a six-hour, five-item Walt Disney World research loop that finds first-party carbohydrate evidence, opens auditable pull requests, auto-merges only unflagged evidence, and appends reviewed evidence to Supabase without changing active nutrition or certification state.

**Architecture:** Keep the Hermes core unchanged. A repository CLI builds a deterministic, read-only Supabase queue; a version-controlled Hermes skill performs official-source research and writes structured findings; repository validators turn those findings into a review artifact and gate a draft PR; a protected post-merge workflow alone receives the Supabase service role and idempotently inserts `nutrition_sources` rows. Phase 1 uses one local worker lease plus GitHub concurrency rather than adding a speculative Supabase queue table.

**Tech Stack:** TypeScript 5.9, Node/tsx, Vitest, Supabase JS v2/Postgres RLS, GitHub Actions/CLI, Hermes skills and cron, Slack delivery through the existing Hermes gateway.

---

## Non-Negotiable Invariants

- Research commands accept only the Supabase URL plus an anon/publishable key. They must not accept or require `SUPABASE_SERVICE_ROLE_KEY`.
- The service role appears only in the protected post-merge GitHub job.
- The worker inserts immutable rows into `nutrition_sources` only.
- No worker path may update `nutritional_data.carbs`, create or activate `nutrition_certifications`, or change `active_certification_id`.
- Only Disney, the named restaurant chain, the manufacturer, or an original document owned by one of those parties qualifies as evidence.
- Missing evidence is recorded as `skipped:no_first_party_source`; it is never estimated.
- A difference is material when its absolute difference is greater than 10 g **or** its relative difference is greater than 20%. Equality at either boundary is not material.
- Any ambiguity, incomplete serving, inexact match, ownership failure, conflict, drift, invalid artifact, or material discrepancy blocks automatic merge.
- GitHub is authoritative. Slack delivery failure cannot change PR or database state.

## Runtime Data Flow

```text
Hermes cron (every 6h)
  -> acquire local lease
  -> queue CLI reads Supabase with anon/publishable key
  -> Hermes researches at most 5 items on first-party sites
  -> findings CLI validates and emits deterministic batch JSON
  -> if accepted + flagged == 0: keep run log locally, Slack summary, no PR
  -> otherwise: branch + draft PR
       -> static artifact/source-policy checks
       -> live read-only catalog/source drift checks
       -> flagged: remain draft for human review
       -> clean: ready + `gh pr merge --auto --squash`
  -> merge to main
       -> protected Action uses service role
       -> idempotent `nutrition_sources` insert
       -> verify exact evidence-key set and unchanged active state
       -> Slack merged/applied or apply-failed update
```

## Artifact Locations

- Committed batches: `audit/nutrition-research/batches/<batch-id>.json`
- Committed PR summaries: `audit/nutrition-research/batches/<batch-id>.md`
- Runtime-only queue/findings/logs: `${HERMES_HOME}/nutrition-research/runs/<batch-id>/`
- Runtime-only lease: `${HERMES_HOME}/nutrition-research/worker.lock`
- Version-controlled Hermes skill source: `ops/hermes-skills/disney-nutrition-research/SKILL.md`

The committed JSON is the apply contract. The Markdown file is derived presentation and must never be parsed by the importer.

---

### Task 1: Add the research domain contract and policy primitives

**Files:**

- Create: `scripts/nutrition/research-contract.ts`
- Create: `scripts/nutrition/__tests__/research-contract.test.ts`

**Step 1: Write the failing contract tests**

Cover these exact behaviors:

```ts
import { describe, expect, it } from 'vitest'
import {
  isMaterialCarbDiscrepancy,
  parseResearchBatch,
  stableResearchJson,
} from '../research-contract.js'

describe('isMaterialCarbDiscrepancy', () => {
  it.each([
    [50, 60, false], // exactly 10 g and 20%
    [50, 60.01, true],
    [100, 110, false],
    [100, 121, true],
    [0, 0, false],
    [0, 1, true],
  ])('%s -> %s = %s', (current, found, expected) => {
    expect(isMaterialCarbDiscrepancy(current, found)).toBe(expected)
  })
})

it('rejects an accepted outcome with an estimate source kind', () => {
  expect(() => parseResearchBatch({
    schemaVersion: 1,
    batchId: 'wdw-20260712T120000Z-a1b2c3d4',
    scope: 'wdw',
    catalogSnapshotAt: '2026-07-12T12:00:00.000Z',
    outcomes: [{ status: 'accepted', sourceKind: 'ai', menuItemId: 'item-1' }],
  })).toThrow(/sourceKind/i)
})

it('serializes object keys and outcome arrays deterministically', () => {
  expect(stableResearchJson({ b: 2, a: 1 })).toBe('{\n  "a": 1,\n  "b": 2\n}\n')
})
```

Also test:

- the four outcome kinds: `accepted`, `flagged`, `skipped`, `failed`;
- the allowed skip/failure/review reason enums;
- exact-item and exact-serving booleans;
- complete serving quantity/unit/description;
- finite, non-negative carbohydrate values;
- URL, content hash, retrieval time, and catalog snapshot requirements;
- no unknown keys, embedded secrets, HTML bodies, or source excerpts over 500 characters;
- duplicate `menuItemId + evidence_key` rejection; and
- stable ordering by menu item ID, status, then evidence key/reason.

**Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run scripts/nutrition/__tests__/research-contract.test.ts
```

Expected: FAIL because `research-contract.ts` does not exist.

**Step 3: Implement the narrow contract**

Define explicit interfaces without adding a schema library:

```ts
export const RESEARCH_SCHEMA_VERSION = 1 as const
export type ResearchScope = 'wdw' | 'all-disney'
export type ResearchStatus = 'accepted' | 'flagged' | 'skipped' | 'failed'

export interface ResearchBatch {
  schemaVersion: 1
  batchId: string
  scope: ResearchScope
  catalogSnapshotAt: string
  generatedAt: string
  outcomes: ResearchOutcome[]
}

export function isMaterialCarbDiscrepancy(
  currentCarbs: number | null,
  foundCarbs: number,
): boolean {
  if (currentCarbs == null) return false
  const absolute = Math.abs(foundCarbs - currentCarbs)
  if (absolute > 10) return true
  if (currentCarbs === 0) return absolute > 0
  return absolute / Math.abs(currentCarbs) > 0.2
}
```

Use exhaustive runtime guards for untrusted JSON. Reuse `buildEvidenceCandidate()` rather than reproducing evidence-key logic. Keep a recursive secret-key/value scanner in this module and reject keys matching `token|secret|password|service_role|api_key` or JWT-like values.

**Step 4: Run focused and neighboring tests**

Run:

```bash
npx vitest run scripts/nutrition/__tests__/research-contract.test.ts scripts/nutrition/__tests__/evidence-intake.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/nutrition/research-contract.ts scripts/nutrition/__tests__/research-contract.test.ts
git commit -m "feat(nutrition): define official research batch contract"
```

---

### Task 2: Build deterministic WDW queue selection

**Files:**

- Create: `scripts/nutrition/research-queue.ts`
- Create: `scripts/nutrition/__tests__/research-queue.test.ts`
- Modify: `scripts/audit/types.ts` only if the existing `Item` type lacks fields already returned by Supabase.

**Step 1: Write failing pure-function tests**

Fixtures must cover Magic Kingdom, EPCOT, Hollywood Studios, Animal Kingdom, Disney Springs, WDW resorts, Blizzard Beach, Typhoon Lagoon, a current WDW festival, Disneyland, Cruise, Aulani, and non-Disney rows.

Assert:

- `scope: 'wdw'` includes all approved WDW surfaces and excludes phase-2 destinations;
- `scope: 'all-disney'` adds Disneyland, Cruise, Aulani, and international Disney destinations;
- missing nutrition and confidence below 70 rank before trusted rows;
- entree/dessert and dosing impact affect priority using `dosingPriorityScore()` from `scripts/audit/trust.ts`;
- certified items, items with accepted evidence, and items already present in an open research batch are excluded;
- chain items are retained because their own official nutrition is allowed;
- ordering is locale-independent and ends with `menuItemId` as the tie-breaker;
- the default and hard maximum batch size are five.

Example API:

```ts
const result = buildResearchQueue(items, {
  scope: 'wdw',
  limit: 5,
  pendingMenuItemIds: new Set(['pending-1']),
  evidencedMenuItemIds: new Set(['done-1']),
  now: '2026-07-12T12:00:00.000Z',
})
expect(result.items).toHaveLength(5)
expect(result.items.map(item => item.menuItemId)).toEqual([...expectedIds])
```

**Step 2: Run the test to verify it fails**

```bash
npx vitest run scripts/nutrition/__tests__/research-queue.test.ts
```

Expected: FAIL because the queue module is missing.

**Step 3: Implement the queue policy**

Export pure functions:

```ts
export interface ResearchQueueOptions {
  scope: ResearchScope
  limit: number
  pendingMenuItemIds: ReadonlySet<string>
  evidencedMenuItemIds: ReadonlySet<string>
  now: string
}

export function isDestinationInScope(location: string | null, scope: ResearchScope): boolean
export function researchPriority(item: ResearchCatalogItem): number
export function buildResearchQueue(
  items: ResearchCatalogItem[],
  options: ResearchQueueOptions,
): ResearchQueue
```

Normalize destination strings in one table-driven map. Do not scatter regexes across the CLI. Add the catalog snapshot fields needed later: item/restaurant/park identity, serving metadata, current carbs, confidence, active certification ID, nutritional row ID, and a SHA-256 hash of those values.

Generate the batch ID from scope + UTC hour + the sorted item IDs and snapshot hashes. Do not use randomness.

**Step 4: Run the tests**

```bash
npx vitest run scripts/nutrition/__tests__/research-queue.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/nutrition/research-queue.ts scripts/nutrition/__tests__/research-queue.test.ts scripts/audit/types.ts
git commit -m "feat(nutrition): prioritize deterministic Disney research queue"
```

---

### Task 3: Add a read-only Supabase client and queue CLI

**Files:**

- Create: `scripts/nutrition/research-supabase.ts`
- Create: `scripts/nutrition/research-queue-cli.ts`
- Create: `scripts/nutrition/__tests__/research-supabase.test.ts`
- Create: `scripts/nutrition/__tests__/research-queue-cli.test.ts`
- Modify: `package.json`

**Step 1: Write failing credential-boundary tests**

Test config resolution without mutating global process state:

```ts
expect(resolveResearchSupabaseConfig({}, {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
})).toEqual({ url: 'https://project.supabase.co', key: 'anon' })

expect(() => resolveResearchSupabaseConfig({}, {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-only',
})).toThrow(/anon or publishable/i)
```

Also assert `.env.local` URL/key pairing, rejection of mixed-project partial config, and acceptance of `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`.

For the CLI, inject a fake client and assert paginated, stable reads of:

- `menu_items` with restaurant/park/nutrition/certification fields;
- existing `nutrition_sources`; and
- active certifications needed for exclusion.

**Step 2: Run tests to verify failure**

```bash
npx vitest run scripts/nutrition/__tests__/research-supabase.test.ts scripts/nutrition/__tests__/research-queue-cli.test.ts
```

Expected: FAIL because the modules are missing.

**Step 3: Implement read-only access**

Keep `scripts/audit/utils.ts:createSupabaseClient()` unchanged because it intentionally serves write-capable audit scripts. The new function must be separate and must use `createClient(url, key, { auth: { persistSession: false } })`.

The CLI interface is:

```bash
npm run nutrition:research-queue -- \
  --scope=wdw \
  --limit=5 \
  --pending-file=/path/to/pending-menu-item-ids.json \
  --out=/path/to/queue.json
```

Rules:

- default scope `wdw` and limit 5;
- reject limit greater than 5;
- require an absolute `--out` path under `HERMES_HOME` unless `--allow-test-output` is passed in tests;
- write atomically through a sibling temporary file and rename;
- never print row contents or credentials;
- print only batch ID and counts as JSON on stdout;
- return exit 0 with an empty queue;
- use explicit `.order('id')` and range pagination.

Add:

```json
"nutrition:research-queue": "tsx scripts/nutrition/research-queue-cli.ts"
```

**Step 4: Run focused tests and typecheck**

```bash
npx vitest run scripts/nutrition/__tests__/research-supabase.test.ts scripts/nutrition/__tests__/research-queue-cli.test.ts
npx tsc --noEmit --pretty false
```

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json scripts/nutrition/research-supabase.ts scripts/nutrition/research-queue-cli.ts scripts/nutrition/__tests__/research-supabase.test.ts scripts/nutrition/__tests__/research-queue-cli.test.ts
git commit -m "feat(nutrition): add read-only Supabase research queue CLI"
```

---

### Task 4: Add the single-worker lease

**Files:**

- Create: `scripts/nutrition/research-lease.ts`
- Create: `scripts/nutrition/research-lease-cli.ts`
- Create: `scripts/nutrition/__tests__/research-lease.test.ts`
- Modify: `package.json`

**Step 1: Write failing lease tests**

Use a temporary directory. Assert:

- first acquisition succeeds using exclusive file creation;
- a second active acquisition returns `busy` without modifying the owner;
- a lease older than 5 hours 30 minutes is replaced;
- only the matching lease token can release it;
- malformed or future-dated locks fail closed and require `--force-expired` for recovery;
- release is idempotent;
- two simultaneous acquisition promises yield exactly one winner.

**Step 2: Verify failure**

```bash
npx vitest run scripts/nutrition/__tests__/research-lease.test.ts
```

Expected: FAIL because the lease module is missing.

**Step 3: Implement lease acquisition/release**

Use `openSync(path, 'wx', 0o600)`, a random ownership token stored only in the runtime directory, and atomic stale-lock replacement. The lock payload contains `schemaVersion`, `token`, `pid`, `hostname`, `acquiredAt`, and `expiresAt`; it contains no catalog data or secrets.

CLI:

```bash
npm run nutrition:research-lease -- acquire --home="$HERMES_HOME"
npm run nutrition:research-lease -- release --home="$HERMES_HOME" --token="$TOKEN"
```

Stdout is one JSON object. `busy` is a successful no-op exit so a scheduled overlap does not look like a system failure.

**Step 4: Run tests**

```bash
npx vitest run scripts/nutrition/__tests__/research-lease.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json scripts/nutrition/research-lease.ts scripts/nutrition/research-lease-cli.ts scripts/nutrition/__tests__/research-lease.test.ts
git commit -m "feat(nutrition): prevent overlapping Hermes research runs"
```

---

### Task 5: Define and enforce first-party source ownership

**Files:**

- Create: `data/nutrition/first-party-source-policy.json`
- Create: `scripts/nutrition/research-source-policy.ts`
- Create: `scripts/nutrition/__tests__/research-source-policy.test.ts`

**Step 1: Write failing ownership tests**

Test exact hostname and subdomain matching, redirect chains, and owner-to-item relationships:

- `disneyworld.disney.go.com` and an approved Disney document host pass for WDW;
- lookalike `disney.go.com.example.com` fails;
- a Disney URL redirecting to a third-party blog fails;
- a named chain's own domain passes only when that chain owns the catalog venue/item;
- a manufacturer domain passes only when `sourceOwnerType: 'manufacturer'` and the artifact names the manufacturer relationship;
- URL shorteners, social posts, search result pages, USDA, MyFitnessPal, AllEars, DFB, blogs, and crowd databases fail;
- HTTP fails unless it redirects to approved HTTPS;
- unknown owners become `flagged:owner_unverified`, never accepted.

**Step 2: Verify failure**

```bash
npx vitest run scripts/nutrition/__tests__/research-source-policy.test.ts
```

Expected: FAIL.

**Step 3: Implement a versioned, table-driven policy**

Start the policy with Disney-owned domains that are confirmed during implementation. Add chain/manufacturer entries only when a real queue item consumes them; do not create a speculative global directory.

```json
{
  "schemaVersion": 1,
  "owners": {
    "disney": {
      "type": "destination",
      "domains": ["disney.go.com", "disneyworld.disney.go.com"]
    }
  }
}
```

Expose:

```ts
export function hostnameMatchesDomain(hostname: string, domain: string): boolean
export function validateSourceOwnership(input: SourceOwnershipInput): SourceOwnershipResult
export async function resolveAndValidateSource(
  input: SourceOwnershipInput,
  fetcher?: typeof fetch,
): Promise<ResolvedSource>
```

Use bounded requests: 15-second timeout, at most five redirects, 2 MB response cap, and at most three attempts for 429/5xx. Capture final URL, ETag/Last-Modified when present, SHA-256 of the fetched bytes, and retrieval time. Never commit the full response.

**Step 4: Run tests**

```bash
npx vitest run scripts/nutrition/__tests__/research-source-policy.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add data/nutrition/first-party-source-policy.json scripts/nutrition/research-source-policy.ts scripts/nutrition/__tests__/research-source-policy.test.ts
git commit -m "feat(nutrition): enforce first-party research sources"
```

---

### Task 6: Convert Hermes findings into a deterministic review batch

**Files:**

- Create: `scripts/nutrition/research-findings.ts`
- Create: `scripts/nutrition/research-findings-cli.ts`
- Create: `scripts/nutrition/__tests__/research-findings.test.ts`
- Create: `scripts/nutrition/__tests__/fixtures/research-queue.json`
- Create: `scripts/nutrition/__tests__/fixtures/research-findings.json`
- Modify: `package.json`

**Step 1: Write failing findings tests**

The Hermes findings file is intentionally simpler than the committed artifact. Every queue item must have exactly one outcome.

Test:

- accepted official evidence becomes an `EvidenceCandidate` via `buildEvidenceCandidate()`;
- no-source becomes `skipped:no_first_party_source`;
- network exhaustion becomes `failed:source_unavailable`, not a skip;
- incomplete serving, inexact item/serving, owner uncertainty, conflict, or material discrepancy becomes `flagged`;
- `50 -> 60` is not material, while `50 -> 60.01` is;
- findings for unknown IDs, omitted queue items, duplicate outcomes, or changed queue snapshot fields fail;
- an AI estimate, recipe, decomposition, or third-party source cannot be accepted or flagged as publishable evidence;
- output ordering and bytes are deterministic for identical queue/findings inputs;
- `accepted + flagged === 0` yields `shouldOpenPullRequest: false` but still writes the runtime batch log.

**Step 2: Verify failure**

```bash
npx vitest run scripts/nutrition/__tests__/research-findings.test.ts
```

Expected: FAIL.

**Step 3: Implement transformation and CLI**

CLI:

```bash
npm run nutrition:research-build -- \
  --queue="$RUN_DIR/queue.json" \
  --findings="$RUN_DIR/findings.json" \
  --runtime-out="$RUN_DIR/batch.json" \
  --commit-out="audit/nutrition-research/batches/$BATCH_ID.json" \
  --summary-out="audit/nutrition-research/batches/$BATCH_ID.md"
```

The CLI must:

1. parse both inputs with strict guards;
2. refetch/validate each proposed source;
3. call `buildEvidenceCandidate()`;
4. compute discrepancy and review flags;
5. validate and stable-serialize the final batch;
6. always write the runtime log;
7. write committed JSON/Markdown only when accepted or flagged evidence exists; and
8. return a machine-readable result containing counts, paths, `shouldOpenPullRequest`, and `blocksAutoMerge`.

The summary links sources and lists values/servings/reasons but contains no copied source prose.

Add:

```json
"nutrition:research-build": "tsx scripts/nutrition/research-findings-cli.ts"
```

**Step 4: Run tests**

```bash
npx vitest run scripts/nutrition/__tests__/research-findings.test.ts scripts/nutrition/__tests__/evidence-intake.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json scripts/nutrition/research-findings.ts scripts/nutrition/research-findings-cli.ts scripts/nutrition/__tests__/research-findings.test.ts scripts/nutrition/__tests__/fixtures/research-queue.json scripts/nutrition/__tests__/fixtures/research-findings.json
git commit -m "feat(nutrition): build auditable research batches"
```

---

### Task 7: Add pre-merge artifact, source, and catalog validation

**Files:**

- Create: `scripts/nutrition/validate-research-batch.ts`
- Create: `scripts/nutrition/validate-research-batch-cli.ts`
- Create: `scripts/nutrition/__tests__/validate-research-batch.test.ts`
- Modify: `package.json`

**Step 1: Write failing validation tests**

With an injected fake read-only Supabase adapter and fetcher, assert:

- an unchanged accepted artifact passes;
- changed menu item name, restaurant, destination, serving, current carbs, confidence, active certification, or source content hash returns `catalog_drift`/`source_drift`;
- a changed redirect destination or ownership fails;
- duplicate evidence keys and conflicting upstream source keys fail;
- flagged outcomes return a valid artifact with `blocksAutoMerge: true`;
- any changed file outside `audit/nutrition-research/batches/*.json|*.md` blocks the evidence-only auto-merge classification;
- no write method is called on the Supabase adapter.

**Step 2: Verify failure**

```bash
npx vitest run scripts/nutrition/__tests__/validate-research-batch.test.ts
```

Expected: FAIL.

**Step 3: Implement validation**

CLI modes:

```bash
npm run nutrition:research-validate -- --static --batch=<path>
npm run nutrition:research-validate -- --live --batch=<path> --changed-files=<path>
```

`--static` requires no credentials and validates contract, source policy shape, deterministic serialization, secret scan, file scope, and review flags. `--live` additionally uses the research read-only client to compare the catalog snapshot and refetch sources.

Output one JSON report and use exit codes:

- 0: valid and auto-merge eligible;
- 2: valid but human review required;
- 1: invalid/error.

Add:

```json
"nutrition:research-validate": "tsx scripts/nutrition/validate-research-batch-cli.ts"
```

**Step 4: Run tests and a fixture CLI invocation**

```bash
npx vitest run scripts/nutrition/__tests__/validate-research-batch.test.ts
npm run nutrition:research-validate -- --static --batch=scripts/nutrition/__tests__/fixtures/valid-research-batch.json
```

Expected: tests PASS; CLI exits 0 and prints `"valid":true`.

**Step 5: Commit**

```bash
git add package.json scripts/nutrition/validate-research-batch.ts scripts/nutrition/validate-research-batch-cli.ts scripts/nutrition/__tests__/validate-research-batch.test.ts scripts/nutrition/__tests__/fixtures/valid-research-batch.json
git commit -m "feat(nutrition): validate research PRs against source and catalog drift"
```

---

### Task 8: Implement the evidence-only protected importer

**Files:**

- Create: `scripts/nutrition/apply-research-batch.ts`
- Create: `scripts/nutrition/apply-research-batch-cli.ts`
- Create: `scripts/nutrition/__tests__/apply-research-batch.test.ts`
- Modify: `package.json`

**Step 1: Write failing importer tests**

Use a narrow adapter interface instead of mocking the entire Supabase query builder:

```ts
export interface ResearchApplyStore {
  snapshotProtectedState(menuItemIds: string[]): Promise<ProtectedStateSnapshot>
  findEvidenceKeys(keys: string[]): Promise<Set<string>>
  insertEvidence(rows: NutritionEvidenceRow[]): Promise<void>
}
```

Assert:

- only `accepted` outcomes are inserted;
- flagged/skipped/failed outcomes never produce rows;
- existing evidence keys are counted as existing and not inserted;
- applying twice inserts zero rows on the second run;
- expected/inserted/existing/verified counts must balance;
- a partial insert or unexpected evidence key fails visibly;
- before/after snapshots of `nutritional_data.carbs`, `active_certification_id`, and certification IDs are byte-equal;
- the adapter exposes no general update/RPC method;
- malformed or review-blocked artifacts cannot be applied.

**Step 2: Verify failure**

```bash
npx vitest run scripts/nutrition/__tests__/apply-research-batch.test.ts
```

Expected: FAIL.

**Step 3: Implement the narrow importer**

The production adapter may call only:

- SELECT on `menu_items`, `nutritional_data`, `nutrition_certifications`, and `nutrition_sources`;
- INSERT/UPSERT on `nutrition_sources` with `onConflict: 'evidence_key'` and `ignoreDuplicates: true`.

Do not call `scripts/import-researched-nutrition.ts --apply`; its legacy write mode can update active nutrition. Reuse only safe shared evidence types/builders.

Require `SUPABASE_SERVICE_ROLE_KEY` and reject anon/publishable keys for this CLI. Require `GITHUB_REF_NAME` to equal the configured protected branch unless `--allow-isolated-test-project` is explicitly supplied.

```bash
npm run nutrition:research-apply -- --batch=<path> --protected-branch=main
```

Add:

```json
"nutrition:research-apply": "tsx scripts/nutrition/apply-research-batch-cli.ts"
```

**Step 4: Run tests**

```bash
npx vitest run scripts/nutrition/__tests__/apply-research-batch.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json scripts/nutrition/apply-research-batch.ts scripts/nutrition/apply-research-batch-cli.ts scripts/nutrition/__tests__/apply-research-batch.test.ts
git commit -m "feat(nutrition): apply reviewed evidence without changing active data"
```

---

### Task 9: Add GitHub validation and protected post-merge workflows

**Files:**

- Create: `.github/workflows/nutrition-research-pr.yml`
- Create: `.github/workflows/nutrition-research-apply.yml`
- Create: `scripts/nutrition/__tests__/research-workflows.test.ts`

**Step 1: Write failing workflow contract tests**

Parse the YAML as text/YAML and assert:

- PR workflow permissions are read-only;
- static validation runs for every batch PR without secrets;
- live validation runs only for trusted same-repository branches and receives only URL + anon/publishable key;
- no `pull_request_target` job checks out or executes PR code;
- apply workflow triggers only after a push to `main` touching committed batch JSON;
- apply workflow has a single concurrency group;
- service-role secret appears only in apply workflow;
- apply workflow checks out merged `main`, discovers JSON changed by the merge commit, validates again, and applies each exactly once;
- a workflow failure is visible and does not loop indefinitely.

**Step 2: Verify failure**

```bash
npx vitest run scripts/nutrition/__tests__/research-workflows.test.ts
```

Expected: FAIL because workflows are missing.

**Step 3: Add the PR workflow**

Use `pull_request` with path filters. Required jobs:

1. `static-contract`: checkout PR commit, install with `npm ci`, run focused tests and static validator.
2. `live-drift`: only when `github.event.pull_request.head.repo.full_name == github.repository`; use environment-scoped `SUPABASE_URL` and `SUPABASE_ANON_KEY`, never service role; run live validator.
3. `auto-merge-gate`: summarize whether the artifact is clean or review-blocked. It must not dismiss reviews or merge anything itself.

The Hermes skill performs `gh pr merge --auto --squash` only after these checks exist. Repository branch protection remains the enforcement point.

**Step 4: Add the apply workflow**

Use:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'audit/nutrition-research/batches/*.json'
concurrency:
  group: nutrition-research-apply-production
  cancel-in-progress: false
```

The job uses a protected GitHub Environment such as `production-nutrition-evidence`, checks out the exact pushed SHA, lists added/modified batch JSON between `${{ github.event.before }}` and `${{ github.sha }}`, runs static validation, then invokes the evidence-only apply CLI. Upload the JSON apply report as an artifact on success or failure. Do not use an unbounded retry action.

**Step 5: Run tests**

```bash
npx vitest run scripts/nutrition/__tests__/research-workflows.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add .github/workflows/nutrition-research-pr.yml .github/workflows/nutrition-research-apply.yml scripts/nutrition/__tests__/research-workflows.test.ts
git commit -m "ci(nutrition): validate and apply merged research evidence"
```

---

### Task 10: Add the version-controlled Hermes skill and installer

**Files:**

- Create: `ops/hermes-skills/disney-nutrition-research/SKILL.md`
- Create: `scripts/hermes/install-disney-nutrition-research.ts`
- Create: `scripts/hermes/__tests__/install-disney-nutrition-research.test.ts`
- Modify: `package.json`

**Step 1: Write failing installer tests**

In a temporary `HERMES_HOME`, assert:

- the skill installs to `skills/research/disney-nutrition-research/SKILL.md`;
- install is atomic and repeatable;
- installed bytes equal version-controlled source bytes;
- an existing modified installed skill is backed up unless `--check` is used;
- `--check` exits nonzero on drift and never writes;
- no secrets or machine-specific absolute paths appear in the skill.

**Step 2: Verify failure**

```bash
npx vitest run scripts/hermes/__tests__/install-disney-nutrition-research.test.ts
```

Expected: FAIL.

**Step 3: Write the skill**

The skill must be complete enough that Hermes can run without guessing policy. Its steps are:

1. verify `gh`, repository cleanliness, authentication, read-only Supabase config, and Slack delivery config;
2. acquire the lease and always release it in a finally-style cleanup;
3. inspect open PRs/committed batches to build pending item IDs;
4. build a WDW queue limited to five;
5. research each item only on permitted first-party sources;
6. write exactly one structured finding per queue item;
7. run the build and static/live validators;
8. if no accepted/flagged evidence exists, create no branch/PR and send a no-result summary;
9. otherwise create `hermes/nutrition-research/<batch-id>`, commit only the two batch files, push, and open a draft PR;
10. leave flagged batches draft with `nutrition-research-review` label;
11. for clean batches, mark ready and run `gh pr merge --auto --squash` after required checks are registered;
12. post the compact Slack summary and PR link;
13. never use a service-role credential, legacy nutrition apply mode, estimates, recipes, decomposition, or third-party evidence.

Include bounded research retries and the exact findings JSON schema. Make the skill state that successful source evidence is still only evidence and never certification.

**Step 4: Implement installer**

CLI:

```bash
npm run hermes:install-nutrition-research -- --hermes-home=<path>
npm run hermes:install-nutrition-research -- --hermes-home=<path> --check
```

Default `--hermes-home` from `HERMES_HOME`; fail if absent. Do not assume `C:\\Users\\...` paths.

Add:

```json
"hermes:install-nutrition-research": "tsx scripts/hermes/install-disney-nutrition-research.ts"
```

**Step 5: Run tests and install into the isolated Hermes home**

```bash
npx vitest run scripts/hermes/__tests__/install-disney-nutrition-research.test.ts
npm run hermes:install-nutrition-research -- --hermes-home=C:/Users/medpe/hermes-builder/home
npm run hermes:install-nutrition-research -- --hermes-home=C:/Users/medpe/hermes-builder/home --check
```

Expected: tests PASS; install and check both succeed.

**Step 6: Commit**

```bash
git add package.json ops/hermes-skills/disney-nutrition-research/SKILL.md scripts/hermes/install-disney-nutrition-research.ts scripts/hermes/__tests__/install-disney-nutrition-research.test.ts
git commit -m "feat(hermes): add Disney nutrition research skill"
```

---

### Task 11: Provision the six-hour Hermes job and Slack delivery safely

**Files:**

- Create: `ops/hermes/disney-nutrition-research-job.json`
- Create: `scripts/hermes/provision-disney-nutrition-research.ts`
- Create: `scripts/hermes/__tests__/provision-disney-nutrition-research.test.ts`
- Modify: `package.json`

**Step 1: Write failing provisioning tests**

Inject a command runner; do not execute Hermes in unit tests. Assert:

- interval is exactly 360 minutes;
- job prompt invokes the installed `disney-nutrition-research` skill in the DiabetesGuide repository;
- job maximum is one concurrent run and the skill still owns the filesystem lease;
- Slack destination is supplied by argument/config, not committed in the template;
- dry-run prints the change and does not mutate Hermes state;
- repeated provisioning updates the named job instead of creating duplicates;
- no database keys or Slack tokens appear in command arguments or output.

**Step 2: Verify failure**

```bash
npx vitest run scripts/hermes/__tests__/provision-disney-nutrition-research.test.ts
```

Expected: FAIL.

**Step 3: Implement template and idempotent provisioner**

The template contains non-secret settings only:

```json
{
  "schemaVersion": 1,
  "name": "disney-nutrition-research",
  "intervalMinutes": 360,
  "maxItems": 5,
  "scope": "wdw",
  "skill": "disney-nutrition-research"
}
```

The provisioner must discover supported Hermes cron command syntax using `hermes cron --help` and use the existing CLI. Do not write Hermes' internal cron database directly. Require an explicit Slack channel/delivery target or confirm a preconfigured named target; tokens remain in Hermes' secret store/config.

Add:

```json
"hermes:provision-nutrition-research": "tsx scripts/hermes/provision-disney-nutrition-research.ts"
```

**Step 4: Run tests, then provision the real job**

```bash
npx vitest run scripts/hermes/__tests__/provision-disney-nutrition-research.test.ts
npm run hermes:provision-nutrition-research -- --dry-run --repo="$PWD" --slack-target=<configured-target>
npm run hermes:provision-nutrition-research -- --repo="$PWD" --slack-target=<configured-target>
hermes cron list
```

Expected: tests PASS; dry-run shows one idempotent upsert; final list shows one enabled six-hour job. If the Slack target cannot be discovered from existing Hermes config, pause here for the user to supply it rather than guessing.

**Step 5: Commit**

```bash
git add package.json ops/hermes/disney-nutrition-research-job.json scripts/hermes/provision-disney-nutrition-research.ts scripts/hermes/__tests__/provision-disney-nutrition-research.test.ts
git commit -m "feat(hermes): schedule Disney nutrition research every six hours"
```

---

### Task 12: Document operations, review, and incident handling

**Files:**

- Create: `docs/runbooks/hermes-nutrition-research.md`
- Modify: `docs/data/nutrition-evidence-intake.md`
- Modify: `docs/runbooks/nutrition-fidelity-rollout.md`

**Step 1: Write the runbook**

Document:

- architecture and credential separation;
- initial skill install and drift check;
- cron provision/update/disable commands;
- required GitHub branch protection, Actions secrets, and protected Environment;
- required read-only Supabase grants/RLS and how to verify them;
- batch artifact/review reason glossary;
- how a human resolves a flagged artifact without deleting audit history;
- source/catalog drift recovery;
- lease recovery after the 5h30 TTL;
- apply failure triage and evidence-key verification;
- Slack delivery failure handling;
- phase-1 WDW scope and the explicit `--scope=all-disney` phase-2 switch;
- medical boundary: evidence does not activate a nutrition value or certification.

Note current Supabase behavior: tables exposed through a public API schema need explicit grants and RLS; service-role credentials remain server-side. This implementation adds no table, function, or migration, so existing `nutrition_sources` protections are reused.

**Step 2: Update evidence intake and rollout docs**

Add the new worker as an official-evidence producer. Clearly distinguish:

- runtime findings;
- PR-reviewed immutable evidence;
- active nutritional data; and
- human-published certification.

**Step 3: Check links and terms**

```bash
rg -n "service.role|SUPABASE_SERVICE_ROLE_KEY|active_certification_id|no_first_party_source|all-disney" docs/runbooks/hermes-nutrition-research.md docs/data/nutrition-evidence-intake.md docs/runbooks/nutrition-fidelity-rollout.md
```

Expected: service role is described only in the protected apply section; all required boundaries are present.

**Step 4: Commit**

```bash
git add docs/runbooks/hermes-nutrition-research.md docs/data/nutrition-evidence-intake.md docs/runbooks/nutrition-fidelity-rollout.md
git commit -m "docs(nutrition): add Hermes research operations runbook"
```

---

### Task 13: Run isolated Supabase integration tests

**Files:**

- Create: `scripts/nutrition/__tests__/apply-research-batch.integration.test.ts`
- Create: `scripts/nutrition/__tests__/fixtures/research-integration-seed.sql`
- Modify: `.github/workflows/nutrition-research-pr.yml` to add an optional protected integration job if a disposable Supabase project is available.

**Step 1: Write an opt-in integration test**

Skip unless all of these are set:

- `TEST_SUPABASE_URL`
- `TEST_SUPABASE_SERVICE_ROLE_KEY`
- `RUN_NUTRITION_RESEARCH_INTEGRATION=1`

The fixture must create or select isolated test menu items, nutritional rows, and certification state. Snapshot IDs and values before apply.

**Step 2: Exercise the real database path**

Test this sequence:

1. apply one valid accepted evidence row;
2. verify exactly one `nutrition_sources` row exists by evidence key;
3. apply the same artifact again;
4. verify zero additional rows;
5. verify `nutritional_data.carbs` unchanged;
6. verify `active_certification_id` unchanged;
7. verify no certification row added or changed;
8. attempt to mutate captured evidence and verify the immutability trigger rejects it;
9. verify the public read-only client cannot write.

**Step 3: Run against an isolated branch/project**

```bash
RUN_NUTRITION_RESEARCH_INTEGRATION=1 \
TEST_SUPABASE_URL=<isolated-url> \
TEST_SUPABASE_SERVICE_ROLE_KEY=<isolated-key> \
npx vitest run scripts/nutrition/__tests__/apply-research-batch.integration.test.ts
```

Expected: PASS. Never point this command at production.

**Step 4: Commit**

```bash
git add .github/workflows/nutrition-research-pr.yml scripts/nutrition/__tests__/apply-research-batch.integration.test.ts scripts/nutrition/__tests__/fixtures/research-integration-seed.sql
git commit -m "test(nutrition): verify evidence-only Supabase apply path"
```

---

### Task 14: Complete end-to-end verification and a controlled dry run

**Files:**

- Modify only files required to fix defects found by verification.

**Step 1: Run the focused suite**

```bash
npx vitest run scripts/nutrition/__tests__/research-contract.test.ts scripts/nutrition/__tests__/research-queue.test.ts scripts/nutrition/__tests__/research-supabase.test.ts scripts/nutrition/__tests__/research-queue-cli.test.ts scripts/nutrition/__tests__/research-lease.test.ts scripts/nutrition/__tests__/research-source-policy.test.ts scripts/nutrition/__tests__/research-findings.test.ts scripts/nutrition/__tests__/validate-research-batch.test.ts scripts/nutrition/__tests__/apply-research-batch.test.ts scripts/nutrition/__tests__/research-workflows.test.ts scripts/hermes/__tests__/install-disney-nutrition-research.test.ts scripts/hermes/__tests__/provision-disney-nutrition-research.test.ts
```

Expected: PASS.

**Step 2: Run repository checks**

```bash
npm test
npm run lint
npm run build
```

Expected: all PASS. Record any unrelated pre-existing failure separately; do not weaken checks.

**Step 3: Verify forbidden writes structurally**

```bash
rg -n "from\(['\"]nutritional_data['\"]\).*update|active_certification_id.*update|publish_nutrition_certification|from\(['\"]nutrition_certifications['\"]\).*(insert|upsert|update)" scripts/nutrition ops/hermes-skills .github/workflows
```

Expected: no match in the new research worker/apply paths.

**Step 4: Perform fixture-backed Hermes dry runs**

Run one five-item fixture with:

- one accepted Disney source;
- one no-source skip;
- one transient source failure;
- one ambiguous serving flag; and
- one material discrepancy flag.

Verify artifact counts, draft status, review label, and Slack summary. Then run an all-no-source fixture and verify there is no branch or PR.

**Step 5: Perform the controlled isolated E2E acceptance run**

With an isolated Supabase project and test GitHub branch/environment:

1. queue five WDW items;
2. research/build a batch;
3. open a test draft PR;
4. prove a material discrepancy blocks auto-merge;
5. resolve/remove the test discrepancy through the documented review path;
6. merge and run the protected apply workflow;
7. prove the second apply inserts zero;
8. prove active carbs/certifications are unchanged;
9. verify Slack links and counts;
10. start overlapping runs and prove only one lease winner.

**Step 6: Commit verification fixes, if any**

```bash
git add <only-the-files-fixed>
git commit -m "fix(nutrition): address research workflow verification findings"
```

Skip this commit when no changes were necessary.

---

## Production Enablement Checklist

Implementation is not production-enabled until all items are true:

- [ ] Required PR checks are present in branch protection.
- [ ] GitHub auto-merge is enabled for the repository.
- [ ] `production-nutrition-evidence` Environment protects the apply job.
- [ ] Production Supabase URL/service role exist only in that Environment.
- [ ] PR/live validation has only read-only Supabase URL + anon/publishable key.
- [ ] The skill is installed and `--check` reports no drift.
- [ ] The Slack destination is verified with a non-production test summary.
- [ ] The six-hour job exists exactly once and is initially disabled.
- [ ] Isolated E2E acceptance passes.
- [ ] The job is enabled for `scope=wdw`, `maxItems=5`.
- [ ] The first production PR is manually observed through merge and apply.

Phase 2 is a later configuration change to `scope=all-disney` after phase-1 quality is reviewed. It does not require a new artifact schema or database surface.
