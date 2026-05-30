---
status: pending
priority: p2
issue_id: 057
tags: [code-review, correctness]
dependencies: []
---

# escapeSearch strips characters instead of escaping; online/offline search diverge

## Problem Statement

escapeSearch deletes , ( ) ' " rather than escaping them, so a search for "Mac & Cheese (Large)" or "Mom’s Pretzel" queries a different string than typed — and the offline fallback uses the raw unescaped query, so the two paths can return different results. Apostrophes are common in menu names.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 057)
