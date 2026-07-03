# Database migrations

`backend/migrations` is the only schema source of truth.

## Rules

- Create schema changes with `npm --prefix backend run migrate:make -- <name>`.
- Commit every migration before applying it outside a local development database.
- Never apply `supabase-setup.sql`, `backend/supabase-setup.sql`, `alter.sql`, or ad-hoc fix scripts.
- Do not edit a migration after it has been applied. Add a follow-up migration.
- Review grants and row-level security in every migration that creates a table or view.

## Verification

```bash
npm --prefix backend run migrations:verify
npm --prefix backend run migrate:status
npm --prefix backend run security:verify-rls
```

A deployment must stop if a migration is pending, a migration timestamp is
duplicated, or the RLS verifier reports browser-role access.
