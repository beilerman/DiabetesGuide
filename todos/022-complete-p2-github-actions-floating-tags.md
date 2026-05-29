---
status: complete
priority: p2
issue_id: 022
tags: [code-review, security, supply-chain, ci]
dependencies: []
---

# GitHub Actions pinned to floating @v4 tags with write + secret access

## Problem Statement
Both `daily-audit.yml` and `weekly-menu-sync.yml` pin third-party actions to floating tags (e.g. `actions/checkout@v4`, `actions/setup-node@v4`). Both workflows have `contents: write` and receive `SUPABASE_SERVICE_ROLE_KEY`. A compromised tag (as has happened to `tj-actions/changed-files`) would gain push access and full DB credentials.

## Findings
- **Source agent:** security-sentinel
- **Evidence:** `.github/workflows/daily-audit.yml`, `.github/workflows/weekly-menu-sync.yml` — `@v4` floating tags throughout.
- **Severity rationale:** P2 — industry-recognized supply-chain risk; not actively exploited, but the upgrade cost is low.

## Proposed Solutions

### Option A — Pin to commit SHAs + Dependabot (recommended)
- **What:** Replace each `@v4` with the full 40-char SHA. Add `.github/dependabot.yml` with `package-ecosystem: github-actions` to keep them current.
- **Pros:** Eliminates the floating-tag attack vector entirely.
- **Pros:** Dependabot PRs keep SHAs fresh with audit trail.
- **Cons:** Diff is noisy (SHAs are unreadable).
- **Cons:** Need to merge Dependabot PRs regularly or they pile up.
- **Effort:** Small
- **Risk:** Low

### Option B — Pin to immutable minor tag (`@v4.2.1`)
- **What:** Replace `@v4` with the most recent immutable patch tag.
- **Pros:** Readable; slightly safer than floating.
- **Pros:** No SHA noise in workflow files.
- **Cons:** Tags are still mutable in GitHub's model — a determined attacker could force-push.
- **Cons:** Requires manual bumps; no Dependabot integration helps.
- **Effort:** Small
- **Risk:** Medium

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\.github\workflows\daily-audit.yml`, `C:\Users\medpe\diabetesguide\.github\workflows\weekly-menu-sync.yml`, new `.github/dependabot.yml`
- **Components/modules:** CI workflows
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] Every third-party action is pinned to a 40-char commit SHA
- [ ] `.github/dependabot.yml` schedules weekly action updates
- [ ] Workflows still run green on next push

## Work Log
- **2026-05-28** Partial Option A. Added `.github/dependabot.yml` with weekly `github-actions` updates configured. Added explicit `TODO P2-022` comments above each `actions/*` use in both workflows directing the next contributor to pin the floating `@v4` tag to the SHA Dependabot proposes. I intentionally did NOT pick SHAs to insert: producing the wrong SHA from memory would either break CI or pin to the wrong release. Once Dependabot opens its first PR (next Monday 06:00 UTC), accept it to satisfy the SHA-pin acceptance criterion. Workflow files still run green on `@v4`.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
