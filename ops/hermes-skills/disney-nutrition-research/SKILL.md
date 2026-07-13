---
name: disney-nutrition-research
description: Use when a scheduled or manual Hermes run must research first-party carbohydrate evidence for the DiabetesGuide Disney catalog.
---

# Disney Nutrition Research

## Overview

Research at most five queued Disney menu items, preserve every outcome, and open an evidence-only pull request. Treat evidence as provenance, not certification. Never change active carbohydrates or certification state.

## Hard boundaries

- Use only Disney, the named restaurant chain, the manufacturer, or an original nutrition document owned by one of those parties.
- Do not use third-party nutrition databases, blogs, crowd reports, recipes, decomposition, or AI estimates.
- When no qualifying source exists, record `skipped:no_first_party_source`. Never estimate a value to fill the gap.
- Use only the read-only Supabase URL and anon/publishable key. The service-role credential is unavailable to this skill; never seek, print, or use a service-role key.
- Never run the legacy nutrition `--apply` path or `nutrition:research-apply`. The protected post-merge workflow owns evidence insertion.
- Never stage or commit files outside the generated batch JSON and Markdown pair.
- Never treat evidence as certification or change `nutritional_data.carbs`, `active_certification_id`, or `nutrition_certifications`.

## Run procedure

1. Work from the DiabetesGuide repository root. Confirm `gh auth status`, the current branch, and the existing worktree status. Leave unrelated untracked files untouched; stop if tracked changes overlap the research batch paths.
2. Acquire the worker lease:

   ```powershell
   npm run nutrition:research-lease -- acquire --home="$env:HERMES_HOME"
   ```

   If the result is `busy`, report the skipped overlap and stop successfully. Save the returned token. Release this lease before every final response, including failures.
3. Inspect open `hermes/nutrition-research/*` pull requests and collect their artifact menu-item IDs into a runtime `pending.json`. Also note newly merged/applied or apply-failed batches for the final status summary.
4. Create `$runDir` under `$env:HERMES_HOME/nutrition-research/runs/<UTC timestamp>/` and build the queue:

   ```powershell
   npm run nutrition:research-queue -- --scope=wdw --limit=5 `
     --pending-file="$runDir/pending.json" --out="$runDir/queue.json"
   ```

   Never exceed the maximum of five items. If the queue is empty, release the lease and return an empty-batch summary.
5. Research each queue item independently. Follow redirects to the final URL and verify ownership. Prefer exact nutrition pages or original PDFs. Capture the source-reported name, carbohydrate grams, serving quantity/unit/description, exact-match decisions, locator, publication date when present, and a source excerpt no longer than 500 characters.
6. Write exactly one finding per queue item to `$runDir/findings.json` using the schema below. Use only `official_research` or `manufacturer_research` for found evidence. A temporary outage is `failed:source_unavailable`, never a no-source result.
7. Build and validate the batch:

   ```powershell
   npm run nutrition:research-build -- `
     --queue="$runDir/queue.json" `
     --findings="$runDir/findings.json" `
     --runtime-out="$runDir/batch.json" `
     --commit-out="audit/nutrition-research/batches/$batchId.json" `
     --summary-out="audit/nutrition-research/batches/$batchId.md"

   npm run nutrition:research-validate -- `
     --static --batch="audit/nutrition-research/batches/$batchId.json"
   npm run nutrition:research-validate -- `
     --live --batch="audit/nutrition-research/batches/$batchId.json"
   ```

8. If there is no accepted or flagged evidence, create no pull request. Keep the runtime batch log, release the lease, and return the counts.
9. Otherwise create or reuse `hermes/nutrition-research/<batch-id>`. Stage and commit only the batch JSON and Markdown. Verify `git diff --cached --name-only` lists exactly those two files before committing.
10. Push the branch and open a draft pull request with the Markdown summary. If the artifact is flagged, add `nutrition-research-review` and leave the PR draft. Do not dismiss or bypass the review block.
11. If the artifact is unflagged and required checks are registered, mark it ready and request repository auto-merge:

    ```powershell
    gh pr ready "$prUrl"
    gh pr merge "$prUrl" --auto --squash
    ```

    If auto-merge is unavailable, leave the PR open and report that exact state.
12. Restore the starting branch when safe. Release the lease using its matching token, then return the Slack-ready summary. GitHub remains authoritative if Slack delivery fails.

## Findings schema

The root object is:

```json
{
  "schemaVersion": 1,
  "batchId": "<queue batchId>",
  "outcomes": []
}
```

A found outcome is:

```json
{
  "status": "found",
  "menuItemId": "<queue ID>",
  "sourceKind": "official_research",
  "sourceOwner": "Disney",
  "ownerId": "disney",
  "sourceOwnerType": "destination",
  "manufacturerRelationship": null,
  "sourceUrl": "https://disneyworld.disney.go.com/...",
  "sourceLocator": "nutrition table row or PDF page",
  "sourceReportedItemName": "Exact source name",
  "reportedCarbs": 42,
  "serving": {
    "quantity": 1,
    "unit": "item",
    "description": "1 item as sold"
  },
  "exactItemMatch": true,
  "exactServingMatch": true,
  "publishedAt": null,
  "upstreamSourceKey": "owner-document-version",
  "sourceExcerpt": "Total Carbohydrate 42 g"
}
```

For a chain, use `sourceOwnerType: "chain"` and the policy owner ID matching the named venue. For a manufacturer, use `sourceKind: "manufacturer_research"`, `sourceOwnerType: "manufacturer"`, and a specific `manufacturerRelationship`.

A no-source outcome is:

```json
{
  "status": "skipped",
  "menuItemId": "<queue ID>",
  "reason": "no_first_party_source",
  "detail": "No qualifying first-party carbohydrate value found."
}
```

A bounded failure is:

```json
{
  "status": "failed",
  "menuItemId": "<queue ID>",
  "reason": "source_unavailable",
  "detail": "Official source remained unavailable after bounded retries."
}
```

## Final delivery

Return one compact message for the cron job's configured Slack delivery:

```text
Disney nutrition research: 5 researched; 2 accepted, 1 flagged, 1 skipped, 1 failed; 1 material discrepancy. PR: <url>. Review: <flagged links>.
```

For no-PR runs, say `PR: none`. Mention only status changes that are ready, blocked, merged/applied, or apply-failed. Do not include credentials, source bodies, or hidden reasoning.

## Common mistakes

| Mistake | Required response |
|---|---|
| Disney menu lists ingredients but no carbs | Record `skipped:no_first_party_source` |
| Search result snippet shows a value | Open and verify the owned source; otherwise reject it |
| Serving size is implied | Preserve it as a flagged incomplete serving |
| Current value differs by more than 10 g or 20% | Keep both values and leave the PR review-blocked |
| Research partly fails | Preserve successful and failed outcomes in the same runtime artifact |
| Slack send fails | Leave GitHub state unchanged and report delivery failure separately |
