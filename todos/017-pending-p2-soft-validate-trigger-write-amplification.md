---
status: pending
priority: p2
issue_id: 017
tags: [code-review, performance, data-integrity, database]
dependencies: []
---

# fn_nutrition_soft_validate trigger write-amplifies audit_log during backfills

## Problem Statement
The `fn_nutrition_soft_validate` trigger writes an `audit_log` row on every `nutritional_data` insert/update. During Codex/Groq backfills (thousands of writes in tight loops) this doubles the write volume and contention, and bloats `audit_log` with low-signal entries. There is no short-circuit for bulk operations.

## Findings
- **Source agent:** data-integrity-guardian
- **Evidence:** `supabase/migrations/00001_initial_schema.sql` (in-place modified) defines the trigger; no skip mechanism exists.
- **Severity rationale:** P2 — operationally painful during backfills, not a correctness issue.

## Proposed Solutions

### Option A — Add session-variable short-circuit (recommended)
- **What:** Inside the trigger body, `IF current_setting('diabetes.skip_audit', true) = 'on' THEN RETURN NEW; END IF;`. Bulk scripts call `SET LOCAL diabetes.skip_audit = 'on'` inside their transaction.
- **Pros:** Backfills opt out explicitly; default behaviour unchanged.
- **Pros:** Reversible per-session; no schema-wide flag.
- **Cons:** Requires every bulk script to set the GUC.
- **Cons:** Easy to forget and silently re-amplify.
- **Effort:** Small
- **Risk:** Low

### Option B — Detach trigger during bulk loads
- **What:** Backfill scripts run `ALTER TABLE nutritional_data DISABLE TRIGGER fn_nutrition_soft_validate` before the load and re-enable after.
- **Pros:** Zero overhead during bulk operations.
- **Pros:** No trigger body changes.
- **Cons:** Requires elevated privileges; risky if script crashes mid-load (trigger stays disabled).
- **Cons:** Affects all sessions, not just the bulk session.
- **Effort:** Small
- **Risk:** Medium

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\supabase\migrations\00001_initial_schema.sql` (trigger body), bulk-load scripts under `scripts/`
- **Components/modules:** `fn_nutrition_soft_validate` trigger, `audit_log` table
- **DB / schema impact:** Yes — trigger body modification (new migration, not in-place edit)

## Acceptance Criteria
- [ ] Trigger honours `diabetes.skip_audit` GUC
- [ ] At least one backfill script demonstrates `SET LOCAL diabetes.skip_audit = 'on'`
- [ ] `audit_log` row count delta verified during a sample backfill
- [ ] Change ships in a new migration (e.g. `00004`), not via in-place edit to `00001`

## Work Log
- **2026-05-28** Deferred. The recommended fix requires authoring a new `00004_audit_log_guc.sql` migration that wraps `fn_nutrition_soft_validate`'s body in an `IF current_setting('diabetes.skip_audit', true) = 'on' THEN RETURN NEW; END IF;` short-circuit, then plumbing a `SET LOCAL diabetes.skip_audit = 'on'` into the backfill scripts that update `nutritional_data` in tight loops (`scripts/upgrade-chain-nutrition.ts`, `scripts/upgrade-verified-nutrition.ts`, `scripts/estimate-nutrition-ai.ts`, `scripts/adjust-portions.ts`). The trigger body lives in two places — `scripts/audit/migrate-constraints.ts` (the source of truth for the SQL generator) and the live DB — both must be updated together. Operationally tolerable today; no `audit_log` row-blowout reported. Suggest pairing with the next intentional backfill so the GUC change can be validated against actual write volume.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 016
