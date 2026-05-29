---
status: pending
priority: p3
issue_id: 042
tags: [code-review, bundle]
dependencies: []
---

# Drop canvas devDependency (only PDF text extraction used)

## Problem Statement
`canvas` is the #1 source of `npm install` flakiness on Windows (native build via node-gyp). The only consumer in this repo is `parse-chain-pdf.ts`, which calls `pdfjs-dist` `getTextContent()` — a code path that does not require `canvas`. Removing the dep would noticeably speed up cold installs and remove a Windows pain point.

## Findings
- **Source agent:** performance-oracle
- **Evidence:** `scripts/parse-chain-pdf.ts` — only uses `getTextContent()`; no rasterization.
- **Severity rationale:** P3 — install-time ergonomics; no production impact.

## Proposed Solutions

### Option A — Remove canvas, validate parse-chain-pdf.ts (recommended)
- **What:** `npm uninstall canvas`. Run `npm run build`. Run `scripts/parse-chain-pdf.ts` against a known PDF; confirm text extraction still works (`pdfjs-dist` falls back gracefully when canvas is absent for text-only paths).
- **Pros:**
  - Faster `npm install` on Windows.
  - One fewer native-build failure mode.
  - Aligns dep manifest with actual usage.
- **Cons:**
  - Need to validate against the actual PDFs we parse.
  - If a future feature needs rasterization, re-add.
- **Effort:** Small
- **Risk:** Low (text-only path is documented as canvas-free in pdfjs)

### Option B — Keep canvas
- **What:** Leave dep in place.
- **Pros:**
  - Zero change.
  - Available if rasterization is ever needed.
- **Cons:**
  - Persistent Windows install flakiness.
  - Unused build burden.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\package.json`
  - `C:\Users\medpe\diabetesguide\scripts\parse-chain-pdf.ts` (verify)
- **Components/modules:** Chain PDF parsing
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] `canvas` removed from package.json.
- [ ] `npm install` succeeds without native-build steps.
- [ ] `npx tsx scripts/parse-chain-pdf.ts <sample.pdf>` returns the same text as before.
- [ ] `npm run build` passes.

## Work Log
- **2026-05-28** Deferred. The fix itself is one-line (`npm uninstall canvas`), but the validation step — running `scripts/parse-chain-pdf.ts` against a known-good chain-restaurant PDF and confirming text extraction still works — needs an actual PDF to test against. The text-only path in `pdfjs-dist` does not strictly require `canvas`, but specific PDF features (some image-embedded fonts) can still fall back to canvas rasterisation. Recommended next step: pick the most-recently-parsed chain PDF, save a baseline of its `getTextContent()` output, remove canvas, and assert byte-identical output before committing.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 041
