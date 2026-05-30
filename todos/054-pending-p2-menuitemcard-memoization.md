---
status: pending
priority: p2
issue_id: 054
tags: [code-review, performance]
dependencies: []
---

# MenuItemCard recomputes grade/annotations/confidence every render

## Problem Statement

Each card calls summarizeConfidence, getGradeForItem (computeScore), and getDiabetesAnnotations directly in render with no useMemo and no React.memo. A flat filtered.map of hundreds–thousands of cards re-runs all three per card on every filter change (the carbs slider fires onChange per pixel).

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 054)
