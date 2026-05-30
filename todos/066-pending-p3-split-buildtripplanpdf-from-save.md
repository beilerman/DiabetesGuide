---
status: pending
priority: p3
issue_id: 066
tags: [code-review, refactor, agent-native]
dependencies: []
---

# Split buildTripPlanPdf from save() and reuse computeDayTotals

## Problem Statement

exportTripPlanPdf lives in lib/ and is mostly pure but ends in doc.save(...) (browser-only), so a Node script/agent cannot get the PDF bytes. It also re-implements computeDayTotals inline. Split into buildTripPlanPdf(...): jsPDF (pure) + a thin save wrapper; delegate totals to one helper (pairs with 030).

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 066)
