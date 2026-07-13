# Hermes Disney Nutrition Research Worker Design

**Date:** 2026-07-12  
**Status:** Approved  
**Project:** DiabetesGuide

## Objective

Add a proactive Hermes research worker that improves DiabetesGuide's nutrition evidence coverage without allowing autonomous medical-data publication. The worker researches first-party carbohydrate data, creates auditable pull requests, and inserts append-only evidence into Supabase after merge. It never changes active carbohydrate values or creates or activates nutrition certifications.

## Decisions

- Use a PR-first evidence workflow.
- Research Walt Disney World first, then expand to all Disney destinations.
- Run every six hours with a maximum of five queue items per batch.
- Accept only first-party evidence from Disney, the named restaurant chain, a manufacturer, or an original nutrition document owned by one of those parties.
- Record no AI estimates, recipe calculations, or third-party database observations through this worker.
- Allow Hermes to merge unflagged evidence-only PRs automatically.
- Require human review when a candidate is ambiguous, incomplete, invalid, conflicting, or materially discrepant.
- Define a material carbohydrate discrepancy as more than 10 grams or more than 20 percent compared with the current catalog value.
- Report each batch in Slack with a link to the pull request.
- Apply reviewed evidence to Supabase automatically after merge.

## Why PR-First

Supabase remains the live catalog and evidence store, while GitHub supplies a durable review and forensic trail. A staging-table-first design would split review state between systems. Direct database writes would be simpler, but would provide weaker review, rollback, and provenance controls.

Disney provides allergen menus more consistently than complete nutrition facts. The worker therefore treats a missing first-party value as an honest negative research result rather than substituting an estimate.

## Architecture

### 1. Prioritized Queue

A DiabetesGuide CLI command reads the current catalog from Supabase with read-only credentials and produces stable queue records. Phase 1 includes Walt Disney World parks, resorts, Disney Springs, water parks, and current festivals. Phase 2 expands to Disneyland, Disney Cruise Line, Aulani, and international Disney parks.

Queue priority uses:

1. missing or sub-70-confidence carbohydrate values;
2. destination phase eligibility;
3. entree and dessert priority over snacks, sides, and beverages;
4. current/popular menu status;
5. likely dosing impact; and
6. deterministic item-ID ordering as the final tie-breaker.

Queue records include the stable Supabase `menu_item_id`, destination, venue, item name, serving metadata, current nutrition value, confidence, category, priority, and catalog snapshot timestamp. A lease prevents concurrent batches from claiming the same item.

### 2. Hermes Skill and Cron Job

A `disney-nutrition-research` Hermes skill defines the source policy and research procedure. It invokes repository CLI commands through the terminal rather than adding a core model tool.

A dedicated cron job runs every six hours. It skips when the previous run still holds the concurrency lock, claims up to five items, and creates no PR when the batch contains no qualifying official evidence.

The research runtime receives read-only Supabase access. It never receives a service-role credential.

### 3. First-Party Research

Allowed sources are:

- Disney-owned web pages, PDFs, menus, or structured endpoints;
- nutrition pages or documents owned by the named restaurant chain;
- manufacturer-owned nutrition pages or documents; and
- original published nutrition documents owned by those parties.

The worker rejects third-party databases, crowd reports, recipe calculations, decomposition, and AI estimates. Redirect resolution must still end at an allowed owner.

For each observation, Hermes captures:

- menu item ID and canonical catalog name;
- source-reported item name;
- reported carbohydrate value;
- serving quantity, unit, description, size, and preparation notes;
- exact-item and exact-serving decisions;
- source owner, URL, locator, retrieval time, and publication date when available;
- source content hash;
- normalized carbohydrate value and formula when normalization is lossless and reviewable;
- stable evidence key and upstream-source key; and
- comparison with the current catalog value.

### 4. Batch Artifact and Pull Request

Each run writes a versioned, deterministic JSON artifact under a dedicated audit directory. The artifact records accepted, skipped, failed, and flagged outcomes so unsuccessful research remains visible.

The pull request contains the artifact, a compact Markdown summary, validation results, and direct links to every accepted or flagged source. Repeating the same research over the same catalog snapshot produces the same evidence keys and ordering.

Hermes opens the PR as a draft. If all required checks pass and no review flag exists, it marks the PR ready and enables auto-merge. Hermes cannot dismiss a blocking review flag.

### 5. Validation and Merge Policy

CI revalidates the artifact against current Supabase state and refetches source metadata before merge. It blocks auto-merge for:

- a missing or non-first-party source;
- ambiguous item identity;
- incomplete serving basis;
- an inexact item or serving match;
- a carbohydrate difference greater than 10 grams or 20 percent;
- conflicting observations sharing an upstream-source key;
- changed content, serving text, item identity, or redirect destination;
- catalog drift after queue creation;
- duplicate or malformed evidence keys;
- schema, test, or idempotency failures; or
- any attempt to alter active nutrition or certification state.

Unflagged evidence-only PRs may auto-merge. Flagged PRs require human review and an explicit resolution recorded in the artifact or PR discussion.

### 6. Supabase Apply

Merge to the protected default branch triggers a GitHub Action with the Supabase service-role credential. The action invokes the existing `--apply-evidence` path and inserts only immutable `nutrition_sources` observations.

The importer:

- is idempotent on `evidence_key`;
- verifies expected inserted and existing-row counts;
- verifies every reviewed evidence key after insertion;
- cannot write `nutritional_data.carbs`;
- cannot create or activate `nutrition_certifications`;
- cannot change `active_certification_id`; and
- fails visibly on partial or unexpected writes.

The service-role credential is unavailable to pull-request code and is exposed only to the protected post-merge job. Forked or untrusted PRs never receive it.

### 7. Slack Reporting

Hermes posts one compact Slack summary per batch with:

- researched item count;
- accepted evidence count;
- skipped, failed, and flagged counts;
- material discrepancy count;
- pull-request link; and
- links to candidates requiring review.

Status-change follow-ups are limited to ready-for-merge, blocked, merged/applied, or apply-failed. Slack delivery is non-blocking because GitHub is the authoritative audit trail.

## Failure Handling

- **No official evidence:** record `skipped:no_first_party_source`; never estimate.
- **Ambiguous item or serving:** retain the candidate with `review_required` and block auto-merge.
- **Material discrepancy:** show both values and block auto-merge.
- **Source drift:** refetch before merge and invalidate stale approval.
- **Catalog drift:** reject the candidate and return the item to the queue.
- **Duplicate work:** use queue leases, deterministic evidence keys, and database idempotency.
- **Partial research failure:** keep successful candidates reviewable and record every failed assignment.
- **Rate limit or outage:** use bounded backoff, then defer; never interpret failure as nutrition data.
- **Supabase apply failure:** fail the workflow, verify the observed row set, and send a Slack alert; do not retry indefinitely.
- **Slack failure:** leave GitHub state unchanged and surface delivery failure separately.
- **Worker overlap:** skip the newer run while an active lease remains valid.

## Security and Medical Boundaries

- Research uses read-only Supabase credentials.
- Only the protected post-merge workflow can access service-role credentials.
- No secret is committed to an artifact, log, or PR.
- Public Supabase access remains read-only and protected by the project's existing RLS/grant model.
- Evidence is not certification.
- This worker cannot make a value dosing-grade or change the value presented as certified.
- Certification remains a separate human-controlled workflow.

## Testing

### Queue Tests

- WDW-only phase-1 filtering
- phase-2 destination expansion
- priority ordering and five-item limit
- lease acquisition, expiry, and overlap exclusion
- exclusion of certified and already-pending items

### Evidence Contract Tests

- stable evidence keys
- exact item and serving requirements
- first-party ownership and redirect validation
- discrepancy thresholds at boundary values
- rejection of estimates and third-party sources

### Artifact Tests

- deterministic JSON ordering
- schema-version validation
- accepted, skipped, failed, and flagged outcomes retained
- secret and excess-source-content scanning

### Supabase Integration Tests

Run against an isolated Supabase branch or disposable project:

- idempotent evidence insertion;
- unchanged active carbohydrate and certification state;
- RLS and grant preservation;
- partial-failure detection; and
- expected-row verification.

### GitHub Workflow Tests

- unflagged artifacts become auto-merge eligible;
- material discrepancies block merge;
- source and catalog drift invalidate approval;
- merge applies exactly the reviewed evidence keys; and
- untrusted PRs never receive protected credentials.

### Hermes Workflow Tests

- five-item fixture-backed dry run;
- empty batch creates no PR;
- partial failures create an honest artifact;
- concurrency lock prevents overlapping runs; and
- Slack summaries contain correct counts and links.

## Acceptance Criteria

1. Complete one WDW batch through an isolated Supabase environment.
2. Apply the same artifact twice and insert zero duplicate rows on the second run.
3. Block auto-merge for a deliberately material discrepancy.
4. Prove active carbohydrate values and certifications remain unchanged.
5. Post a correct Slack summary linked to the test PR.
6. Run at least one empty/no-source batch without creating a PR.
7. Demonstrate queue lease behavior with overlapping scheduled runs.

## Rollout

### Phase 1: Walt Disney World

Enable the worker for WDW parks, resorts, Disney Springs, water parks, and festivals. Begin with fixture-backed dry runs, then isolated Supabase integration, then production evidence-only auto-merge.

### Phase 2: All Disney Destinations

Expand the queue filter to Disneyland, Disney Cruise Line, Aulani, and international parks. Reuse the same artifact schema, evidence policy, merge gates, and Supabase apply path.

