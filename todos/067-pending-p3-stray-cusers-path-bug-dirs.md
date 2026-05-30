---
status: pending
priority: p3
issue_id: 067
tags: [code-review, cleanup]
dependencies: []
---

# Stray C:Users… path-bug directories from a mis-joined Windows path

## Problem Statement

Two empty directories literally named C:Usersmedpediabetesguidedatachains/ and C:Usersmedpediabetesguidedocsplans/ exist (untracked) — a script passed an absolute Windows path where a relative segment was expected. The real targets (data/chains/, docs/plans/) exist alongside. Delete the stray dirs and grep scripts for the offending path construction.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 067)
