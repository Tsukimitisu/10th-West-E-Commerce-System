# Database migrations

`backend/migrations` is the only schema source of truth.

## Rules

- Create schema changes with `npm --prefix backend run migrate:make -- <name>`.
- Commit every migration before applying it outside a local development database.
- Never apply `supabase-setup.sql`, `backend/supabase-setup.sql`, `alter.sql`, or ad-hoc fix scripts.
- Do not edit a migration after it has been applied. Add a follow-up migration.
- Review grants and row-level security in every migration that creates a table or view.
- Treat `migrate:down` as a potentially destructive, controlled rollback; do
  not run it casually against a shared or production database.

## Verification

```bash
npm --prefix backend run db:check
npm --prefix backend run migrations:verify
npm --prefix backend run migrate:status
npm --prefix backend run migrate:check
npm --prefix backend run security:verify-rls
npm --prefix backend run audit:integrity
```

Run these commands against the intended deployment database before starting the
new application version. A deployment must stop if the database check fails, a
migration is pending, a migration timestamp is duplicated, the RLS verifier
reports browser-role access, an unsafe policy, or a table missing RLS, or the
integrity audit fails. `migrate:status` may exit successfully while printing
pending files; `migrate:check` is the fail-closed deployment gate.

Database-touching commands resolve configuration from `backend/.env`; an
already-set process environment variable takes precedence. `migrations:verify`
is a filesystem/source check and does not contact the database. Prefer setting
only `DATABASE_URL`. `SUPABASE_DB_URL` is an alias and must contain the same URL
when both values are compared after trimming surrounding whitespace. Direct
database configuration with `NODE_ENV=test` requires a separate, explicit
`TEST_DATABASE_URL`; the `npm test` wrapper injects an unreachable local sentinel
when it is absent.
