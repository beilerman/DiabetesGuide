---
title: Applying Supabase DDL when MCP OAuth attaches to wrong organization
category: integration-issues
date: 2026-05-02
status: solved
problem_type: integration_issue
component: supabase + claude-code-mcp + browser-automation
symptoms:
  - Supabase MCP OAuth consent screen only listed projects from one organization, omitting the target project owned by the same human user in a different org
  - MCP list_migrations and apply_migration calls against project rcrzdpzwcbekgqgiwqcp returned permission denied after OAuth completed
  - MCP authenticate / complete_authentication tools were one-shot and disappeared after first use, blocking re-auth from the same session
  - Service-role key in .env.local could perform REST CRUD/SELECT but rejected DDL (CREATE TRIGGER, ALTER TABLE, CREATE UNIQUE INDEX)
  - Supabase CLI was not installed and no Postgres connection string was available
  - Navigating browser to dashboard SQL Editor URL redirected to org landing page because Chrome was logged into the wrong Supabase account
  - Supabase SQL Editor showed "Query has destructive operations" modal on idempotent DROP TRIGGER IF EXISTS statements
tags:
  - supabase
  - mcp
  - oauth
  - migration
  - browser-automation
  - monaco-editor
  - ddl
  - service-role-key
  - multi-org
related_files:
  - supabase/migrations/00002_freshness_and_uniqueness.sql
  - scripts/audit/verify-post-migration.ts
  - ADVISED_REVISIONS.md
  - .env.local
---

## Root Cause

Supabase MCP OAuth consent is granted **per-organization**, not per-user. The plugin authenticated to the wrong org (Eilerman Endocrinology) and `list_migrations` against project `rcrzdpzwcbekgqgiwqcp` returned `permission denied`. The MCP's `authenticate` / `complete_authentication` tools are one-shot per session and disappeared after first use, so re-consenting to the correct org from the same session was impossible — leaving the logged-in SQL Editor browser tab as the only viable DDL path.

## Solution

1. Sign in to the Supabase account that owns the target project's org in the same Chrome instance the agent is driving.
2. Navigate the tab directly to the project's SQL editor:
   `https://supabase.com/dashboard/project/<PROJECT_REF>/sql/new`
   (If you land on the org page instead, the wrong account is signed in — fix that first.)
3. Inject the migration SQL into the Monaco editor via its JS API rather than simulating keystrokes (faster, immune to autocomplete/IME interference, handles multi-statement SQL cleanly):
   ```js
   const ed = monaco.editor.getEditors()[0];
   ed.setValue(sqlString);
   ```
4. Click **Run**. If the SQL contains idempotent DDL like `DROP TRIGGER IF EXISTS ... ; CREATE TRIGGER ...`, Supabase shows a "destructive operations" confirmation modal — click through it.
5. Verify with the post-migration script (it loads env inline from `.env.local`):
   ```bash
   SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) \
   SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) \
   npx tsx scripts/audit/verify-post-migration.ts
   ```
   Expect 17/17 PASS (row counts, new columns, trigger defaults, zero duplicates/missing/invalid). Then re-run `npm run audit:pipeline -- --dry-run --skip-report` and confirm HIGH=0 / MEDIUM=0.

## Why The Other Paths Failed

| Path | Why it failed |
|------|---------------|
| Service-role key over PostgREST | REST endpoint cannot execute DDL — only DML/RPC. |
| Supabase CLI (`supabase link` + `db push`) | CLI not installed locally. |
| Supabase MCP — wrong org | OAuth consent was scoped to "Eilerman Endocrinology" org. DiabetesGuide lives in a different org owned by the same human. `list_migrations rcrzdpzwcbekgqgiwqcp` → `permission denied`. |
| Supabase MCP — re-auth | `authenticate` / `complete_authentication` tools are one-shot per MCP session and vanish after first use, so switching orgs mid-session is impossible. |
| Browser nav while wrong account logged in | Supabase auto-redirected away from `/dashboard/project/<ref>/sql/new` to the org dashboard, never landing in the SQL editor. |

## Code

Monaco populate snippet (run via `mcp__claude-in-chrome__javascript_tool` after navigating to the SQL editor):

```js
const ed = monaco.editor.getEditors()[0];
ed.setValue(sqlString);  // sqlString = full contents of the .sql migration file
```

Verification invocation (Git Bash on Windows; pattern reused across all DiabetesGuide scripts — auto memory [claude]):

```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) \
SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) \
npx tsx scripts/audit/verify-post-migration.ts
```

Key insight for re-use: when an MCP plugin's auth is org-scoped and one-shot, don't fight it — fall back to the browser-control MCP against an already-authenticated tab. Monaco's `setValue` is the right primitive for shipping multi-statement SQL into the editor; keystroke simulation is slower and brittle against the editor's autocomplete.

## Prevention

- Add the Supabase org name and org ID to `CLAUDE.md` under the Supabase Instance section (e.g., `Org: <name> (id: <org_id>)`) so the MCP `authenticate` consent screen is selected correctly on the first (and only) attempt — note explicitly that the MCP `authenticate` tool is one-shot and re-running requires revoking the token in the Supabase dashboard.
- Store a `SUPABASE_DB_URL` (pooler connection string from Project Settings → Database → Connection string → URI, with `?sslmode=require`) in `.env.local` and document it alongside the existing keys. Service-role + anon keys cannot run DDL via PostgREST; the connection string is the only password-free path for `psql`/`tsx pg`-based migrations.
- Add `npm run db:migrate` that runs `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql` (or a small `tsx` wrapper using `pg`), so migrations don't depend on a logged-in browser at all.
- Document the Monaco fallback in `CLAUDE.md` under a new "Applying migrations via SQL Editor" subsection: paste via `monaco.editor.getEditors()[0].setValue(sql)` then click Run — paste/keystroke approaches truncate large files and corrupt `$$`-quoted blocks.
- Before any browser-driven DDL session, verify the active Supabase account by visiting `https://supabase.com/dashboard/account/me` and confirming the email matches the project owner and the project ref is visible in the project dropdown.
- Pin the Supabase CLI in `package.json` (`"supabase"` in devDependencies) so `npx supabase db push` is always available without a global install.

## Verification

After applying any migration, run:

1. `npx tsx scripts/audit/verify-post-migration.ts` — checks columns, trigger-populated `updated_at`, row counts, and zero duplicates/missing/invalid rows. Exits non-zero on drift.
2. `npm run audit:pipeline -- --dry-run --skip-report` — exercises the freshness/uniqueness code paths against live schema without writing a report or mutating data; failures here indicate the migration didn't land.

## Future Test / Sanity Check

Add a startup-time schema check (run from `scripts/audit/pipeline.ts` and as a Vitest test) that parses `CREATE TABLE` / `ALTER TABLE` / `CREATE UNIQUE INDEX` statements in `supabase/migrations/*.sql`, queries `information_schema.columns` and `pg_indexes` for the corresponding objects, and fails loudly listing any missing columns, indexes, or unique constraints — catching a half-applied migration before the audit pipeline silently produces wrong results.

## Related

- `ADVISED_REVISIONS.md` — handoff doc that listed this migration as the required revision; updated 2026-05-02 to reflect completion.
- `CLAUDE.md` (root) — Supabase setup gotchas section. No prior mention of MCP OAuth org scoping or Monaco automation; the Prevention section above proposes additions.
