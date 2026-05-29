---
status: complete
priority: p1
issue_id: 001
tags: [code-review, security]
dependencies: []
---

# Signed W-9 PDFs present in working tree (SSN + signature + address)

## Problem Statement
Signed W-9 PDFs containing SSN, signature, and home address sit in `data/w9-output/` inside the repo working tree. While `.gitignore` was updated this session to ignore the directory, the files are still physically present on disk inside a public-repo working copy, which is a leak risk if anyone runs `git add -f` or copies the working tree. We also have not yet verified that no signed form was ever committed historically.

## Findings
- **Source agent:** security-sentinel
- **Evidence:** `data/w9-output/W9_Tax_Form.pdf`, `W9_Eilerman_redated.pdf`, `W9_Eilerman_prefilled.pdf` — signed PDFs with PII present in working tree.
- **Severity rationale:** Public repo; PII (SSN + signature) leak would be a privacy disaster and is functionally irrecoverable once published to GitHub.

## Proposed Solutions

### Option A — Move PDFs out of repo + audit git history (recommended)
- **What:** Move all signed PDFs to `~/Documents/tax/` (outside the repo). Run `git log --all -- 'data/w9-output/**'` and `git log --all --diff-filter=A --name-only | grep w9` to confirm no historical commit ever tracked these files.
- **Pros:**
  - Physically removes the leak surface.
  - History audit catches any prior accidental commits.
- **Cons:**
  - Manual file move (no script).
  - Must remember new location for future W-9 workflow runs.
- **Effort:** Small
- **Risk:** Low

### Option B — Encrypt in place via age/gpg
- **What:** Leave PDFs in `data/w9-output/` but encrypt with `age` or `gpg`, keep `.gitignore` rule.
- **Pros:**
  - Files stay co-located with the script that generates them.
  - Encrypted blobs are safe even if accidentally added.
- **Cons:**
  - Adds key-management burden.
  - Encrypted-at-rest doesn't protect from a developer running `git add -f` on the decrypted copy.
- **Effort:** Medium
- **Risk:** Medium

## Recommended Action
*(blank — filled during triage)*

## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\data\w9-output\W9_Tax_Form.pdf`, `W9_Eilerman_redated.pdf`, `W9_Eilerman_prefilled.pdf`
- **Components/modules:** W-9 generation workflow (`scripts/build-w9-prefilled.ts`, `restamp-w9-date.ts`)
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] All signed W-9 PDFs moved out of the repo working tree (verified `ls data/w9-output/` is empty or contains only non-sensitive templates).
- [ ] `git log --all -- 'data/w9-output/**'` returns no historical commits containing signed PDFs.
- [ ] `git status` confirms no W-9 PDFs are tracked or staged.
- [ ] `.gitignore` rule for `data/w9-output/` confirmed still present.

## Work Log
- **2026-05-28** Audited git history: `git log --all -- 'data/w9-output/**'` and `git log --all --diff-filter=A | grep -i w9` both returned empty — no historical leak. Moved `W9_Tax_Form.pdf`, `W9_Eilerman_redated.pdf`, `W9_Eilerman_prefilled.pdf` to `~/Documents/tax/`. Working tree now contains only the blank IRS template `fw9-irs.pdf` plus the gitignored `profile.json` (added under todo 002). `.gitignore` rule confirmed via `git check-ignore`.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 002
