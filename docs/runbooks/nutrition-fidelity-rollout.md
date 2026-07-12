# Nutrition Fidelity Rollout

## Current state

The fidelity code is implemented in shadow mode. `VITE_NUTRITION_CERTIFICATION_TRUST` defaults to `false`. Production still uses the legacy confidence presentation, and the fidelity audit honestly reports zero evidence-backed certifications until the schema and reviewed evidence are deployed.

Do not enable the UI flag before completing every gate below.

## Gate 0: privileged production preflight

Use a privileged read-only connection to verify the production objects that the public API cannot expose:

- `nutrition_sources` column types, defaults, primary/foreign keys, triggers, owner, policies, and grants;
- all existing writers of `nutrition_sources`;
- no conflicting objects named `nutrition_certifications`, `nutrition_certification_evidence`, or `nutrition_evidence_checks`;
- `nutritional_data` remains one row per menu item; and
- all 105 legacy source rows still match the checked-in inventory.

Stop if the legacy table differs from `docs/data/nutrition-evidence-mapping.md`. Update the migration and rerun static, policy, and migration tests before proceeding.

## Gate 1: validate the migration outside production

Apply `supabase/migrations/20260711184149_nutrition_fidelity.sql` to an isolated Supabase branch or disposable project.

Test transactions for:

- valid Tier A publication;
- valid Tier B publication with two independent upstream keys;
- rejection of AI/generic evidence as Tier A;
- rejection of serving, menu-item, carb, expiry, and expected-active-ID mismatches;
- rejection of Tier A → Tier B downgrade;
- rejection of evidence-link changes after activation;
- rejection of anonymous/authenticated writes; and
- successful public reads of transparency fields only.

Run Supabase security and performance advisors. Both must be clear before production.

## Gate 2: deploy schema only

Keep `VITE_NUTRITION_CERTIFICATION_TRUST=false`.

1. Record pre-migration row counts and active grants/policies.
2. Apply the reviewed migration.
3. Confirm legacy source count is unchanged and certification/check tables are empty.
4. Confirm no existing `nutritional_data` carbs or serving values changed.
5. Confirm the publication function is executable only by `service_role`.
6. Run advisors and the full read-only audit suite.

Rollback at this stage means leaving the additive objects unused while correcting forward with a new migration. Do not remove evidence history after it exists.

## Gate 3: establish the deployed shadow baseline

Run:

```powershell
npm run audit:fidelity -- --dry-run
npm run evidence:backfill
npm run evidence:monitor
```

Expected before evidence review:

- no canonical carb changes;
- no active certifications;
- no certified-value regressions;
- backfill results consistent with the checked-in 17,306-item baseline; and
- monitoring creates no evidence mutations.

Investigate any drift before importing evidence.

## Gate 4: capture and review evidence

Generate review artifacts:

```powershell
npm run import:researched -- --review-out=audit/researched-evidence-review.json
npm run import:ai -- --review-out=audit/ai-evidence-review.json
```

Only reviewed, source- and serving-complete observations may be stored:

```powershell
npm run import:researched -- --apply-evidence
```

AI, keyword, recipe, decomposition, and generic database observations cannot become Tier A/B by confidence relabeling.

Create a reviewed certification artifact from `data/reviewed-nutrition-certifications.example.json`. Validate it without writes:

```powershell
npm run certifications:publish -- --file=data/reviewed-nutrition-certifications.json
```

Apply only after reviewing `audit/certification-publish-plan.json`:

```powershell
npm run certifications:publish -- --file=data/reviewed-nutrition-certifications.json --apply
```

The command writes a pre-write manifest before calling the atomic publication function.

## Gate 5: controlled UI rollout

Start with a reviewed high-impact slice, not the entire catalog.

1. Set `VITE_NUTRITION_CERTIFICATION_TRUST=true` in a preview deployment.
2. Verify Tier A, Tier B, uncertified, expired, quarantined, multi-serving, and mixed-meal cases.
3. Confirm uncertified meals cannot populate the meal insulin estimator automatically.
4. Confirm manual Insulin Helper entry remains available and clearly user-entered.
5. Verify mobile/desktop, keyboard, screen-reader labels, offline cache refresh, and rollback flag behavior.
6. Compare UI trust with database state for a stratified sample.

Enable production only after accepting the resulting honest coverage level and review queue.

## Gate 6: steady-state operation

The daily workflow runs the fidelity audit and evidence monitor. Operational targets are:

- zero active certifications without complete serving/evidence;
- zero HIGH findings on certified rows;
- zero unreviewed certified-value changes;
- zero public writes to evidence/certification/check tables;
- monthly high-impact sampling; and
- review or renewal of all remaining certifications at least quarterly.

Use `docs/runbooks/nutrition-fidelity-incident.md` for source changes, serving drift, conflicts, or incorrect certification.

## Rollback

For a UI-policy defect, set `VITE_NUTRITION_CERTIFICATION_TRUST=false` and redeploy.

For a data defect, quarantine the affected active pointer, preserve every evidence and decision row, identify the upstream blast radius, and correct through a new reviewed evidence record and superseding decision. Never edit history to make an incident disappear.
