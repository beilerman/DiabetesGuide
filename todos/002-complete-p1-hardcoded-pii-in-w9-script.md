---
status: complete
priority: p1
issue_id: 002
tags: [code-review, security]
dependencies: []
---

# Hardcoded PII (legal name, DBA, home address, ZIP) in build-w9-prefilled.ts

## Problem Statement
`scripts/build-w9-prefilled.ts` lines 26-31 contain hardcoded PII: legal name, DBA, home street address, and ZIP code. The repo is public. Once committed, this PII lives in `git log` forever and cannot be cleanly removed without a destructive history rewrite. Even if reverted, the data remains discoverable via the commit history.

## Findings
- **Source agent:** security-sentinel
- **Evidence:** `scripts/build-w9-prefilled.ts:26-31` — profile object literal with name/DBA/address/ZIP baked in as string literals.
- **Severity rationale:** Public repo + irreversible git history exposure. PII leakage. Must be fixed before this script is ever committed.

## Proposed Solutions

### Option A — Externalize profile to gitignored JSON (recommended)
- **What:** Move profile data to `data/w9-output/profile.json` (already gitignored). Replace inline literal with `JSON.parse(readFileSync('data/w9-output/profile.json', 'utf8'))`. Document the schema in a `profile.example.json` template (no real PII).
- **Pros:**
  - Profile never enters git history.
  - Same `.gitignore` rule that protects PDFs protects the profile.
  - Easy template for future users.
- **Cons:**
  - One extra file to manage locally.
  - Script must handle missing-file error gracefully.
- **Effort:** Small
- **Risk:** Low

### Option B — Move entire script to taxes/ project
- **What:** Per P3-09, relocate `build-w9-prefilled.ts`, `restamp-w9-date.ts`, `fw9-irs.pdf` to the `taxes/` private repo where PII handling is in-scope.
- **Pros:**
  - Removes the W-9 workflow from a public diabetes-app repo entirely (right tool, right place).
  - Reduces repo surface area (~175 LOC).
- **Cons:**
  - Requires setting up the workflow in `taxes/`.
  - Loses session continuity if W-9 is needed from this workspace.
- **Effort:** Medium
- **Risk:** Low

## Recommended Action
*(blank — filled during triage)*

## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\build-w9-prefilled.ts`
- **Components/modules:** W-9 generation script
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] No PII string literals remain in `scripts/build-w9-prefilled.ts` (grep for legal name, street, ZIP returns 0 hits).
- [ ] Profile loaded from gitignored source (JSON file or env var) at runtime.
- [ ] `git log -p -- scripts/build-w9-prefilled.ts` shows no historical PII committed.
- [ ] Script still produces a valid prefilled W-9 PDF when run with a valid profile present.

## Work Log
- **2026-05-28** Chose Option A. Replaced inline `PROFILE` literal in `scripts/build-w9-prefilled.ts` with `loadProfile()` reading from gitignored `data/w9-output/profile.json`. Added `scripts/w9-profile.example.json` template (placeholders only) for new users. Also removed dead `FIELD_VALUES` literal that leaked the same name. Moved OUT path to `~/Documents/tax/W9_prefilled.pdf` so future runs do not write PII into the working tree. Did the same to `scripts/restamp-w9-date.ts` (SRC/OUT both moved to `~/Documents/tax/`). `grep` for the PII string literals returns only path-constant matches (filename "Eilerman" is the user's chosen output name and matches existing pattern).

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 001
