---
status: complete
priority: p3
issue_id: 041
tags: [code-review, bundle]
dependencies: []
---

# Move jspdf from devDependencies to dependencies

## Problem Statement
`Plan.tsx` lazy-imports `jspdf`. Vite emits a runtime chunk for it, so `jspdf` is a runtime dep, not a build-only tool. Listing it under `devDependencies` means a `npm prune --production` (e.g., in some CI/host configurations) would break the deployed Plan export. Moving to `dependencies` correctly reflects reality.

## Findings
- **Source agent:** performance-oracle / kieran-typescript-reviewer
- **Evidence:** `src/pages/Plan.tsx` — `await import('jspdf')` runtime path; `package.json` lists `jspdf` under devDependencies.
- **Severity rationale:** P3 — packaging correctness; Vercel build currently keeps devDeps so functional today but conceptually wrong.

## Proposed Solutions

### Option A — Move to dependencies (recommended)
- **What:** Edit `package.json` to relocate `jspdf` (and its types if present) into `dependencies`. Reinstall.
- **Pros:**
  - Survives `npm install --omit=dev` / `npm prune --production`.
  - Accurately models runtime usage.
  - One-line change.
- **Cons:**
  - Slightly larger `node_modules` for non-Vercel install paths.
  - None significant.
- **Effort:** Small
- **Risk:** Low

### Option B — Leave in devDependencies
- **What:** Keep as-is; rely on Vercel keeping devDeps.
- **Pros:**
  - Zero change.
  - Works on Vercel today.
- **Cons:**
  - Breaks `--omit=dev` builds silently at runtime.
  - Misrepresents the dep classification.
- **Effort:** Small
- **Risk:** Medium (silent runtime break in non-Vercel deploys)

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\package.json`
  - `C:\Users\medpe\diabetesguide\package-lock.json` (regenerated)
- **Components/modules:** Plan page PDF export
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] `jspdf` (and `@types/jspdf` if any) listed under `dependencies`.
- [ ] `npm install --omit=dev` then build → Plan PDF export still works.
- [ ] `npm run build` succeeds.

## Work Log
- **2026-05-28** Option A. Moved `"jspdf": "^4.2.0"` from `devDependencies` to `dependencies` in `package.json`. `Plan.tsx` still does the lazy `await import('jspdf')` so the chunk is only loaded when the user requests an export, but the dep now survives `npm install --omit=dev`.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 042 (canvas devdep)
