---
status: complete
priority: p3
issue_id: 069
tags: [code-review, repo-hygiene, git]
dependencies: []
---

# ~10 MB of regenerable audit-*.json dumps tracked in git

## Problem Statement

`audit-dump.json` (~7.4 MB), `audit-report.json` (~2.4 MB), and
`full-audit-report.json` (~167 KB) were tracked in git and absent from
`.gitignore`, despite being regenerated on demand by `scripts/audit/*` and
`full-audit.ts`. They bloat every clone and diff, permanently in history. Two
review agents flagged this; an intermediate note in the review writeup wrongly
dismissed it as a false positive (a transient mis-read from a sub-agent's staged
`git rm` that was later reverted by `git reset --hard`). On a clean tree,
`git ls-tree HEAD` confirms all three were tracked.

## Resolution

`git rm --cached audit-dump.json audit-report.json full-audit-report.json`
(files kept on disk so the audit tooling still works) and added a
`# Root audit dumps` block to `.gitignore`. Verified: no longer tracked
(`git ls-files`), now ignored (`git check-ignore`), still present on disk.

## Work Log

- 2026-05-30 — Untracked the three dumps + gitignored them. Confirmed disk files intact.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 069)
