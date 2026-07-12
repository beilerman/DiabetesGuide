# Hermes Nutrition Research Operations

## Purpose and boundary

Hermes researches first-party Disney carbohydrate evidence and opens evidence-only pull requests. Supabase remains the live catalog and evidence store; GitHub is the review and forensic record.

The worker cannot publish an active carbohydrate or certification. A merged batch inserts immutable `nutrition_sources` rows only. Certification remains a separate human-controlled workflow.

## Architecture

1. A Hermes cron job runs every 360 minutes from the DiabetesGuide repository.
2. A filesystem lease permits one worker for at most 5 hours 30 minutes.
3. The queue CLI reads Supabase with an anon/publishable key and selects at most five WDW items.
4. The `disney-nutrition-research` skill researches first-party sources and writes runtime findings.
5. The findings builder creates deterministic JSON/Markdown under `audit/nutrition-research/batches/` only when accepted or flagged evidence exists.
6. Pull-request CI validates artifact shape, file scope, source ownership/content, and catalog drift.
7. Clean PRs may auto-merge; flagged PRs remain blocked until the artifact records a human resolution.
8. A protected post-merge Action receives the service role and idempotently inserts accepted evidence.
9. Hermes delivers the batch summary through its configured Slack target. Slack is non-authoritative.

No Supabase table or function is added for this worker. The single local worker lease and GitHub concurrency avoid speculative database queue infrastructure.

## Credential separation

### Research runtime

Provide a matching project URL and one read-only key:

- `SUPABASE_URL` or `VITE_SUPABASE_URL`; and
- `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, or `SUPABASE_PUBLISHABLE_KEY`.

The queue and validation clients reject service-role-only configuration. The skill must never receive or use the service role.

### GitHub pull-request checks

Configure repository Actions secrets for the same project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

These are used only for same-repository live drift checks. Fork PRs run static validation without secrets. The workflow never uses `pull_request_target`.

### Protected post-merge apply

Create the protected GitHub Environment `production-nutrition-evidence` and store:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Restrict the Environment to the protected `main` branch. Do not define the service role in the PR workflow.

Supabase grants determine which objects the public client can reach; RLS determines which rows it can read. Keep RLS enabled on exposed-schema tables, preserve read-only public policies, and keep service-role credentials server-side. The worker reuses the existing `nutrition_sources` grants, RLS, unique evidence-key index, and immutability trigger.

## Install or update the skill

From the repository root:

```powershell
npm run hermes:install-nutrition-research -- --hermes-home=C:/Users/medpe/hermes-builder/home
npm run hermes:install-nutrition-research -- --hermes-home=C:/Users/medpe/hermes-builder/home --check
```

Install is atomic. A locally modified installed skill is backed up before replacement. `--check` never writes and fails on missing/drifted content.

After updating a running gateway, use `/reload-skills` or restart the gateway before expecting a new skill version in fresh cron sessions.

## Provision and control the job

Discover the correct CLI binary with `hermes cron create --help`. The checked-in provisioner verifies required flags and updates an existing exact-name job rather than creating duplicates.

```powershell
npm run hermes:provision-nutrition-research -- --dry-run `
  --repo=C:/Users/medpe/DiabetesGuide `
  --slack-target=slack:<channel-or-dm-id> `
  --hermes-command=C:/path/to/hermes.exe

npm run hermes:provision-nutrition-research -- `
  --repo=C:/Users/medpe/DiabetesGuide `
  --slack-target=slack:<channel-or-dm-id> `
  --hermes-command=C:/path/to/hermes.exe
```

Then verify:

```powershell
hermes cron list --all
hermes cron status
```

Operational controls:

```powershell
hermes cron pause <job-id>
hermes cron resume <job-id>
hermes cron run <job-id>
hermes cron remove <job-id>
```

Do not edit Hermes' cron persistence files directly. A stopped gateway means built-in cron jobs will not fire.

## Manual dry run

Set `HERMES_HOME`, work from a clean repository branch, and load the skill explicitly:

```powershell
hermes --skills disney-nutrition-research chat -q "Run one Disney nutrition research batch and stop before opening a PR."
```

For lower-level queue verification:

```powershell
npm run nutrition:research-lease -- acquire --home="$env:HERMES_HOME"
npm run nutrition:research-queue -- --scope=wdw --limit=5 `
  --out="$env:HERMES_HOME/nutrition-research/runs/manual/queue.json"
```

Release the lease with the exact returned token. Never force a malformed/future-dated lease until confirming no worker is active.

## Artifact and review states

Committed artifacts are `audit/nutrition-research/batches/<batch-id>.json` plus a derived Markdown summary. Runtime-only queues, findings, and no-result batches remain under `$HERMES_HOME/nutrition-research/runs/`.

| State | Meaning | Merge behavior |
|---|---|---|
| `accepted` | Exact first-party item and serving with complete provenance | Eligible after all checks |
| `flagged` | Ambiguity, incomplete serving, ownership uncertainty, conflict, drift, or material discrepancy | Blocked for human resolution |
| `skipped:no_first_party_source` | No qualifying owned carbohydrate source exists | Never estimate; no evidence insert |
| `failed:source_unavailable` | Bounded retries exhausted | Defer; outage is not nutrition data |

A material discrepancy is an absolute difference greater than 10 g **or** a relative difference greater than 20%. Equality at a boundary is not material.

Human resolution must update the artifact: convert a proven candidate to `accepted`, or replace it with a documented skip/failure. PR discussion alone does not make a flagged artifact apply-safe. The protected importer rejects any batch that still contains `flagged`.

## Apply verification

The protected workflow:

- reconstructs every evidence key from reviewed fields;
- skips existing keys;
- inserts only missing accepted `nutrition_sources` rows;
- verifies every expected key afterward; and
- compares `nutritional_data.carbs`, `active_certification_id`, and certification IDs before and after.

Applying the same artifact twice must report zero new rows on the second run.

## Incident handling

### Catalog or source drift

Leave the PR blocked. Requeue the item from current Supabase state and research the current source. Do not overwrite the captured artifact or weaken its hash.

### Apply failure

1. Keep the GitHub workflow failed and inspect its uploaded `nutrition-research-apply-*` report.
2. Query the expected evidence keys and separate existing from missing rows.
3. Confirm protected nutrition/certification snapshots are unchanged.
4. Fix the cause through reviewed code/config and rerun the protected workflow once. Do not add an infinite retry loop.

### Lease recovery

An ordinary expired lease is replaced automatically. For malformed or future-dated state, confirm the worker and gateway are stopped before using `--force-expired`. The ownership token is runtime-only and must not be shared or committed.

### Slack delivery failure

Do not change or roll back GitHub/Supabase state. GitHub is authoritative. Correct the configured Slack target or gateway credentials, then send a separate status update.

## Rollout scope

Phase 1 uses `scope=wdw`: four parks, resorts, Disney Springs, water parks, and WDW festivals. Keep the five-item limit until production batches demonstrate stable ownership, serving, review, and apply behavior.

Phase 2 changes queue scope to `all-disney` for Disneyland, Disney Cruise Line, Aulani, and international Disney destinations. Reuse the same artifact schema, validators, merge gate, and evidence-only importer.
