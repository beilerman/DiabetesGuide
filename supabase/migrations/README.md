# Migration policy

## Index creation: use `CONCURRENTLY` on large tables

Any new migration that creates an index on a table over **100,000 rows** MUST
use `CREATE INDEX CONCURRENTLY` (or `CREATE UNIQUE INDEX CONCURRENTLY`).

The plain form takes an `ACCESS EXCLUSIVE` lock on the target table for the
duration of the build, blocking all reads and writes. `CONCURRENTLY` builds
the index in the background with only `SHARE UPDATE EXCLUSIVE`, allowing
normal traffic to continue.

```sql
-- Wrong on a large table — blocks reads + writes for tens of seconds at scale.
CREATE UNIQUE INDEX idx_menu_items_restaurant_name
  ON menu_items(restaurant_id, lower(name));

-- Correct: online build, restartable.
CREATE UNIQUE INDEX CONCURRENTLY idx_menu_items_restaurant_name
  ON menu_items(restaurant_id, lower(name));
```

Caveats:
- `CONCURRENTLY` cannot run inside a transaction block. Each `CREATE INDEX
  CONCURRENTLY` must be its own statement in the migration file.
- If the build fails, the index is left in `INVALID` state. Drop it and retry:
  `DROP INDEX CONCURRENTLY <name>; CREATE INDEX CONCURRENTLY <name> ON ...;`.

## Adding CHECK constraints: `NOT VALID` then `VALIDATE`

`ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` performs a full-table scan
under `ACCESS EXCLUSIVE` lock to verify existing rows. On tables of any size
this is a long-pause operation.

Split it into two steps:

1. `ADD CONSTRAINT ... CHECK (...) NOT VALID` — catalog-only, ~instant.
   The constraint applies to new and updated rows immediately.
2. `ALTER TABLE ... VALIDATE CONSTRAINT <name>` — scans existing rows under
   `SHARE UPDATE EXCLUSIVE` (concurrent reads + writes allowed). Restartable.

`scripts/audit/migrate-constraints.ts` follows this pattern.

## History

- 00001 — initial schema (do not mutate in place; use additive migrations).
- 00002 — freshness columns + uniqueness indexes (pre-policy; small tables).
- 00003 — park-name normalised uniqueness (pre-policy; small table).
