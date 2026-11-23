# Supabase Advisor follow-up

Baseline: read-only inspection of the configured database on 2026-11-10.
The original Advisor export was unavailable. All 121 foreign keys and 244
indexes in `public` and `recovery_control` were inspected instead; no rows,
credentials or customer data were exported. Largest estimated table: 1,828 rows.

## Migration

`202611100002_backend_policies_and_fk_indexes.cjs` adds one backend-only,
statement-evaluated `app_access_check()` policy to the 12 listed backup,
recovery, phone and Offline POS tables. Browser/PUBLIC grants remain revoked.
Existing backend grants, table data and constraints are unchanged. Unexpected
additional policies stop the migration for review instead of being removed.

59 uncovered foreign keys were found. Their schema/table/column manifest is
`backend/src/database/fixtures/advisorForeignKeys.json`. The migration checks
the actual catalogue again: it reuses full, valid B-tree leading-key coverage,
including composite/UNIQUE indexes, and creates `idx_fk_<table>_<columns>`
only when needed. Long names receive a deterministic hash suffix. Partial,
expression-only, non-leading and INCLUDE-only coverage is insufficient.
Normal indexes suit the current small tables; PostgreSQL index creation can
temporarily block writes. Apply in a quiet maintenance window. No table rewrite.

## Unused-index review

`SUPABASE_ADVISOR_INDEX_REVIEW.csv` records the decision, definition and source
references for each of the 116 zero-scan indexes observed. Statistics have no
usable reset timestamp; an index with no scans is not proven unnecessary.

Only `idx_oauth_codes_hash` is conditionally removed: its exact non-unique
lookup is already provided by `oauth_codes_code_hash_key`. The migration
checks definitions and dependencies first and preserves that UNIQUE constraint.
The other 115 indexes remain: constraint/business uniqueness, FK coverage,
authentication/recovery, expiry cleanup, specialized filtering/sorting or
infrequent operations. Some overlap is only a prefix, predicate or different
operator class; it is not proof of equivalent cost or behavior.
New FK indexes may themselves report zero scans until corresponding operations
occur. Those INFO findings should remain; do not force them to zero by deletion.

## Apply later

Confirm the intended database/backup and review pending migrations first:

```sh
npm --prefix backend run migrate:status
npm --prefix backend run migrate
npm --prefix backend run security:verify-rls
npm --prefix backend run migrate:status
```

No production migration was executed during implementation. Rerun Supabase
Advisor afterward. Rollback intentionally retains security and useful indexes;
reversing these changes requires a reviewed forward migration.
