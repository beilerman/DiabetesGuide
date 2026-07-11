# Dosing-Critical Nutrition Fidelity Implementation Plan

> **For Codex:** REQUIRED SKILLS: Use `superpowers:test-driven-development` for each behavior change, `supabase:supabase` and `supabase:supabase-postgres-best-practices` for database work, and `superpowers:verification-before-completion` before claiming completion.

**Goal:** Replace confidence-only carbohydrate trust with evidence-backed certification that requires an exact serving basis, reviewable provenance, current approval, and ongoing revalidation.

**Architecture:** Keep immutable source observations separate from canonical nutrition values. A pure policy module evaluates evidence and certification states; Supabase constraints enforce the minimum database invariants; importers create review candidates rather than self-certifying; audits measure fidelity and operate the expiry/conflict queue; the UI switches to certification-based trust only after a shadow-mode rollout.

**Tech Stack:** PostgreSQL/Supabase, TypeScript, Vitest, React/Vite, GitHub Actions.

---

### Task 1: Inventory the legacy provenance contract

**Files:**
- Create: `audit/nutrition-sources-inventory.json`
- Create: `docs/data/nutrition-evidence-mapping.md`
- Test: `scripts/__tests__/static-deployment-assets.test.ts`

**Step 1: Capture a read-only schema and population inventory**

Query `information_schema`, constraints, policies, grants, and aggregate null/distinct counts for `public.nutrition_sources`. Do not select secret-bearing columns or modify rows. Record column names/types, keys, relationship to `nutritional_data` or `menu_items`, source-type distribution, and whether rows behave as immutable observations.

**Step 2: Decide reuse versus additive replacement**

Document one mapping:

- extend `nutrition_sources` if it can represent one immutable source observation per item; or
- preserve it unchanged and create `nutrition_evidence` if its semantics conflict.

The mapping must account for all 105 production rows and must not discard or reinterpret them silently.

**Step 3: Add a failing static contract test**

Require the future migration to contain the selected evidence table, certification decision table, RLS, explicit grants, serving checks, and certification invariants.

Run:

```powershell
npx vitest run scripts/__tests__/static-deployment-assets.test.ts
```

Expected: FAIL because the fidelity migration is not present.

**Step 4: Commit the inventory and failing contract**

```powershell
git add audit/nutrition-sources-inventory.json docs/data/nutrition-evidence-mapping.md scripts/__tests__/static-deployment-assets.test.ts
git commit -m "test(data): define nutrition evidence contract"
```

### Task 2: Add immutable evidence and certification schema

**Files:**
- Create: `supabase/migrations/<timestamp>_nutrition_fidelity.sql`
- Modify: `scripts/__tests__/static-deployment-assets.test.ts`

**Step 1: Generate the migration**

```powershell
npx supabase migration new nutrition_fidelity
```

**Step 2: Implement the selected evidence schema**

The evidence record must support:

- `menu_item_id`, reported item name, source owner/type, URL/document locator;
- original carbs and serving quantity/unit/description;
- size, preparation, and configuration notes;
- retrieval/publication dates and content hash;
- normalization formula/inputs;
- immutable supersession linkage; and
- created timestamp.

Add a certification decision record with tier/status, reviewer identifier, reason, reviewed/expiry timestamps, and links to the evidence used. Add minimal canonical fields to `nutritional_data`: serving description, active certification decision, and denormalized status/tier if needed for efficient public reads.

Use text checks instead of a PostgreSQL enum for lifecycle values so the workflow can evolve through additive migrations. Prevent updates to immutable evidence fields with a trigger; supersession creates a new row.

**Step 3: Enforce database invariants**

The database must reject active Tier A/B certification when:

- carbs are null;
- serving basis is incomplete;
- no active decision/evidence exists;
- the approval is expired;
- the linked evidence belongs to another menu item; or
- the status and tier disagree.

Use constrained `search_path` on functions/triggers. Enable RLS. Grant public read only to the transparency fields required by the app; grant no public writes.

**Step 4: Run migration tests**

```powershell
npx vitest run scripts/__tests__/static-deployment-assets.test.ts
```

Expected: PASS.

**Step 5: Verify on an isolated database or Supabase branch**

Apply the migration outside production, test valid and invalid certification transactions, then run Supabase security and performance advisors. Do not apply production DDL in this task.

**Step 6: Commit**

```powershell
git add supabase/migrations scripts/__tests__/static-deployment-assets.test.ts
git commit -m "feat(db): add nutrition fidelity evidence model"
```

### Task 3: Implement the certification policy as pure code

**Files:**
- Create: `src/lib/nutrition-fidelity.ts`
- Create: `src/lib/__tests__/nutrition-fidelity.test.ts`

**Step 1: Write failing policy tests**

Cover:

- Tier A exact official evidence passes with a complete serving;
- Tier B requires two independent observations;
- agreement uses `max(2g, 10% of the higher value)`;
- two observations with the same upstream document are dependent;
- Tier C/D never become dosing-grade;
- ambiguous multi-serving/configurable items are blocked;
- expired or quarantined decisions are not dosing-grade;
- plausibility alone never certifies; and
- stronger/newer active evidence cannot be downgraded.

Run:

```powershell
npx vitest run src/lib/__tests__/nutrition-fidelity.test.ts
```

Expected: FAIL because the policy module does not exist.

**Step 2: Implement the minimum policy**

Export typed, deterministic functions for serving completeness, evidence independence, agreement tolerance, certification eligibility, active status, and never-downgrade comparison. Keep database and clock access outside the module; pass `now` explicitly.

**Step 3: Run the focused test**

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/lib/nutrition-fidelity.ts src/lib/__tests__/nutrition-fidelity.test.ts
git commit -m "feat(data): codify carb certification policy"
```

### Task 4: Make evidence intake dry-run and review-first

**Files:**
- Create: `scripts/nutrition/evidence-intake.ts`
- Create: `scripts/nutrition/__tests__/evidence-intake.test.ts`
- Modify: `scripts/import-researched-nutrition.ts`
- Modify: `scripts/import-ai-nutrition.ts`
- Modify: `scripts/README.md`

**Step 1: Write failing intake tests**

Require that:

- official research produces an evidence candidate, not an automatic certification;
- original and normalized values are both retained;
- incomplete serving data routes to review;
- AI/keyword/decomposition sources are capped at Tier C/D;
- content-equivalent sources share an upstream fingerprint;
- dry-run is the default;
- apply mode writes an undo/audit manifest before canonical updates; and
- existing stronger evidence is never overwritten.

**Step 2: Implement a shared evidence candidate builder**

Use the pure policy module for validation. Import commands should emit a deterministic JSON review artifact. Require an explicit `--apply-evidence` flag to store candidate observations and a separate reviewed decision artifact to publish a canonical value.

**Step 3: Adapt existing importers**

Preserve their current candidate generation and conflict-safe behavior, but route new provenance through the shared intake path. AI imports must not create Tier A/B decisions regardless of numeric confidence.

**Step 4: Run focused and existing importer tests**

```powershell
npx vitest run scripts/nutrition/__tests__/evidence-intake.test.ts scripts/__tests__/import-researched-nutrition.test.ts scripts/__tests__/import-ai-nutrition.test.ts
```

Adjust paths only if the existing importer tests use different filenames.

**Step 5: Commit**

```powershell
git add scripts/nutrition scripts/import-researched-nutrition.ts scripts/import-ai-nutrition.ts scripts/README.md
git commit -m "feat(data): route nutrition imports through evidence review"
```

### Task 5: Add the fidelity audit and operating queue

**Files:**
- Create: `scripts/audit/fidelity.ts`
- Create: `scripts/audit/__tests__/fidelity.test.ts`
- Modify: `scripts/audit/pipeline.ts`
- Modify: `scripts/audit/quality.ts`
- Modify: `package.json`
- Create: `audit/fidelity-results.json`

**Step 1: Write failing audit tests**

Use fixtures for complete Tier A, independent Tier B, dependent-source conflict, missing serving, expired approval, unreachable source state, unexpected certified-value change, and upcoming expiry.

Assert both catalog-wide and dosing-impact-weighted metrics:

- Tier distribution and dosing-grade coverage;
- explicit-serving and retrievable-provenance coverage;
- evidence age/expiry buckets;
- conflicts and quarantines;
- manual sampling queue; and
- certified-value regression count.

**Step 2: Implement the pure report calculation**

Separate calculation from Supabase fetching and file writes. Reuse the existing destination/category priority function. Never make network reachability decide certification inside the pure calculation; consume a recorded monitoring result.

**Step 3: Add CLI and pipeline integration**

Add `npm run audit:fidelity`. The daily audit should fail on invariant violations or unreviewed certified-value changes, but shadow-mode coverage differences should report without failing until the rollout gate is enabled.

**Step 4: Run tests and a read-only live dry run**

```powershell
npx vitest run scripts/audit/__tests__/fidelity.test.ts scripts/audit/__tests__/quality.test.ts
npm run audit:fidelity -- --dry-run
```

Expected: tests pass and the dry run writes no database rows.

**Step 5: Commit**

```powershell
git add scripts/audit package.json audit/fidelity-results.json
git commit -m "feat(audit): measure dosing-critical nutrition fidelity"
```

### Task 6: Backfill evidence conservatively in shadow mode

**Files:**
- Create: `scripts/nutrition/backfill-evidence.ts`
- Create: `scripts/nutrition/__tests__/backfill-evidence.test.ts`
- Create: `audit/fidelity-backfill-plan.json`

**Step 1: Write failing backfill tests**

Require deterministic classification of existing rows:

- a source detail without explicit serving stays unreviewed;
- generic USDA/API rows become Tier D evidence;
- AI/keyword/triangulated rows become Tier C/D evidence;
- exact researched official entries become candidates but are not auto-certified without serving validation;
- malformed citations are quarantined for review; and
- repeat runs are idempotent.

**Step 2: Generate a production dry-run plan**

The plan reports counts by proposed tier/status, missing serving basis, malformed source, park/category priority, and every canonical value that would change. Expected canonical changes in shadow mode: zero.

**Step 3: Review a high-impact sample**

Manually inspect a stratified sample across source types, parks, categories, and proposed tiers. Record false-promotion and false-demotion findings before enabling apply mode.

**Step 4: Apply evidence only after explicit approval**

Store immutable evidence records without switching UI trust or auto-certifying rows. Verify row counts, foreign keys, idempotency, RLS, and advisors afterward.

**Step 5: Commit script and reviewed plan; do not commit secrets**

```powershell
git add scripts/nutrition audit/fidelity-backfill-plan.json
git commit -m "feat(data): backfill nutrition evidence in shadow mode"
```

### Task 7: Switch the UI from confidence to active certification

**Files:**
- Modify: `src/lib/nutrition-trust.ts`
- Modify: `src/lib/display.ts`
- Modify: `src/components/menu/MenuItemCard.tsx`
- Modify: `src/components/search/SearchResultRow.tsx`
- Modify: `src/pages/MenuItemDetail.tsx`
- Modify: meal-cart/insulin-helper trust aggregation files discovered with `rg "confidence_score|carbs" src`
- Modify: corresponding tests

**Step 1: Write failing trust-path tests**

Cover:

- active Tier A/B is dosing-grade;
- confidence 90 without certification is still an estimate;
- expired/quarantined evidence is excluded from precise dosing totals;
- mixed trusted/untrusted cart values trigger a warning and do not appear as a fully trusted total;
- Tier C/D displays an estimate marker or range; and
- source/serving transparency is available on item detail.

**Step 2: Implement behind a feature flag**

Add a single trust predicate and use it everywhere. Do not scatter tier checks through components. During rollout, log old-versus-new classification counts without exposing sensitive data.

**Step 3: Run focused UI tests**

```powershell
npx vitest run src/lib/__tests__/nutrition-fidelity.test.ts src/components/menu/__tests__/MenuItemCard.test.tsx src/pages/__tests__/MenuItemDetail.test.tsx
```

Run every meal-cart and insulin-helper test discovered in the repository.

**Step 4: Browser-test the complete flow**

Verify certified, estimated, expired, quarantined, multi-serving, and mixed-cart examples at mobile and desktop widths. Confirm keyboard and screen-reader labels communicate trust without relying on color.

**Step 5: Commit**

```powershell
git add src
git commit -m "feat(ui): require certification for dosing-grade carbs"
```

### Task 8: Automate monitoring, expiry, and incident handling

**Files:**
- Create: `scripts/nutrition/monitor-evidence.ts`
- Create: `scripts/nutrition/__tests__/monitor-evidence.test.ts`
- Modify: `.github/workflows/daily-audit.yml`
- Create: `docs/runbooks/nutrition-fidelity-incident.md`
- Modify: `scripts/README.md`

**Step 1: Write failing monitoring tests**

Cover unchanged retrieval, changed content hash, unavailable source, redirect, item/serving change, upcoming expiry, and shared-source blast radius. Network calls must be injected and mocked.

**Step 2: Implement non-destructive monitoring**

The monitor records observations and opens review findings. It does not rewrite carbs. A changed source or expired approval causes the active classifier to stop treating the value as dosing-grade according to the database policy.

**Step 3: Add scheduling**

Run link/hash checks daily, create the monthly high-impact sample queue, and ensure every other certified item is reviewed at least quarterly. Workflow artifacts must include summaries, not secrets or full private documents.

**Step 4: Write the incident runbook**

Document quarantine, blast-radius search, evidence preservation, correction review, restoration, and post-incident learning.

**Step 5: Commit**

```powershell
git add scripts/nutrition .github/workflows/daily-audit.yml docs/runbooks/nutrition-fidelity-incident.md scripts/README.md
git commit -m "feat(ops): monitor certified nutrition evidence"
```

### Task 9: Verify, deploy in gates, and establish the baseline

**Files:**
- Modify: `audit/quality-results.json`
- Modify: `audit/quality-history.json`
- Modify: `audit/fidelity-results.json`
- Create: `docs/runbooks/nutrition-fidelity-rollout.md`

**Step 1: Run complete local verification**

```powershell
npm test -- --run
npm run lint
npm run build
npm run audit:fidelity -- --dry-run
```

Expected: all tests pass, lint is clean, build succeeds, and no database writes occur during the audit.

**Step 2: Apply the schema migration before data or UI changes**

Take a schema/data inventory, apply the reviewed migration, verify constraints/RLS/grants, and run security and performance advisors. Abort the rollout on any unexpected row mutation or advisor finding.

**Step 3: Apply evidence backfill only**

Confirm canonical carb changes remain zero. Compare planned and actual counts and verify idempotency with a second dry run.

**Step 4: Establish the shadow baseline**

Record old confidence-based trust beside new certification-based trust. Review all unexpected Tier A/B candidates and enough stratified samples to meet the agreed manual sample threshold.

**Step 5: Enable certification-based UI for a controlled slice**

Start with the reviewed high-impact destinations/categories. Verify browser -> API -> database -> UI behavior and rollback flag operation before expanding.

**Step 6: Complete rollout only after the coverage floor is accepted**

Record the expected honest drop from confidence-based coverage, outstanding review queue, operational owners, monthly/quarterly review dates, and incident contacts in the rollout runbook.

**Step 7: Final production verification**

Check:

- zero public writes to evidence/certification tables;
- zero active certifications lacking serving/evidence/expiry;
- zero HIGH audit findings on certified rows;
- zero unreviewed certified-value changes;
- UI trust matches database status for sampled items; and
- security/performance advisors remain clean.

**Step 8: Commit the verified baseline**

```powershell
git add audit docs/runbooks/nutrition-fidelity-rollout.md
git commit -m "docs(data): establish nutrition fidelity baseline"
```
