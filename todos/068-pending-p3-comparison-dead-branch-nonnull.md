---
status: pending
priority: p3
issue_id: 068
tags: [code-review, quality]
dependencies: []
---

# ComparisonModal dead render branch + redundant non-null assertions

## Problem Statement

{typeof val === 'number' ? val : val} renders val either way (collapse to {val}). Several ! assertions are locally guarded but fragile (VenueMenu.tsx:45, filters.ts:67,91, GradeBadge.tsx:25). Use get-or-insert / narrowed values instead.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 068)
