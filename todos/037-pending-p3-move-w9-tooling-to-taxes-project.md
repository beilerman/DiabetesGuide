---
status: pending
priority: p3
issue_id: 037
tags: [code-review, simplicity, security]
dependencies: []
---

# Move W-9 tooling to taxes/ project (~175 LOC)

## Problem Statement
`scripts/build-w9-prefilled.ts`, `scripts/restamp-w9-date.ts`, and `fw9-irs.pdf` belong to TaxPilot, not the diabetes guide. They live in this repo only by historical accident and are tangentially involved in the W-9 PII leak (P1-01/P1-02). Moving them to `taxes/` aligns with the projects table in `C:\Users\medpe\CLAUDE.md` and reduces blast radius.

## Findings
- **Source agent:** code-simplicity-reviewer (cross-referenced with security-sentinel)
- **Evidence:** `scripts/build-w9-prefilled.ts`, `scripts/restamp-w9-date.ts`, `fw9-irs.pdf` — unrelated to diabetes/menu data.
- **Severity rationale:** P3 — organizational hygiene; security urgency is tracked separately as P1-01/02.

## Proposed Solutions

### Option A — Move to taxes/ (recommended)
- **What:** Move all three artifacts to `C:\Users\medpe\taxes\scripts\` (or `taxes/forms/`). Update any package.json scripts. Confirm taxes/ has the deps (`pdf-lib`, etc.) or add them.
- **Pros:**
  - Repo cohesion: diabetes-guide stops shipping tax tooling.
  - Co-located with W-9 PII handling already done in taxes/.
  - Smaller surface for accidental commits of signed forms.
- **Cons:**
  - Need to add deps to taxes/ if missing.
  - Coordinate commits across two repos.
- **Effort:** Small
- **Risk:** Low

### Option B — Delete entirely
- **What:** Drop the W-9 tooling; tax forms filled by hand.
- **Pros:**
  - Smallest footprint.
  - Removes any temptation to commit PII.
- **Cons:**
  - Loses working automation.
  - Doesn't help if user still wants the workflow.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\scripts\build-w9-prefilled.ts`
  - `C:\Users\medpe\diabetesguide\scripts\restamp-w9-date.ts`
  - `C:\Users\medpe\diabetesguide\fw9-irs.pdf`
  - Target: `C:\Users\medpe\taxes\` subtree (TBD location)
- **Components/modules:** None in diabetesguide app
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] All three artifacts moved to `taxes/` (or deleted if Option B chosen).
- [ ] `git log` review for any unique W-9 logic worth preserving.
- [ ] `taxes/` README updated to mention the moved tooling.
- [ ] No remaining references to W-9 in `diabetesguide/`.

## Work Log
- **2026-05-28** Deferred. The acute PII risk was handled under P1-001 (signed PDFs moved to `~/Documents/tax/`) and P1-002 (PII extracted to gitignored `profile.json` + I/O paths moved outside the repo). What remains is purely organisational — relocating the scripts themselves to the `taxes/` sister repo per the project map in `~/CLAUDE.md`. That's a cross-repo move that needs the taxes/ project's deps (`pdf-lib`) verified or installed, and coordination of two commits. Lower priority than the security objective, which is already met. Reasonable to pair with the next tax-related work in `taxes/`.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: P1-01, P1-02 (security urgency)
- Projects table: `C:\Users\medpe\CLAUDE.md`
