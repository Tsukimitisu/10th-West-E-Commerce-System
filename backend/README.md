# 10th West Moto Backend API

Express REST API for the 10th West Moto commerce system. It uses PostgreSQL,
HttpOnly server-side sessions, CSRF protection, validation, and role-based
access control.

## Prerequisites

- Node.js 20+
- npm 10+
- A PostgreSQL or Supabase project

## Install and configure

```bash
npm install
cp .env.example .env
```

Edit `backend/.env` and provide `DATABASE_URL`, `JWT_SECRET`, and the other
values needed by the selected environment. `backend/.env` is the backend's only
file environment source, even when a command starts from the repository root.
Already-set process environment variables take precedence.

Copy the exact PostgreSQL URI from Supabase Dashboard **Connect** and prefer
setting only `DATABASE_URL`. `SUPABASE_DB_URL` is a supported alias; if both are
set, their values must match after surrounding whitespace is trimmed. Use the
dashboard-provided host and username, percent-encode reserved password
characters, and never commit a connection URL. Pooler usernames are normally
project-qualified; direct connections normally use `postgres`.

Supabase connection modes are:

- Direct connection on `5432`.
- Session pooler on `5432`.
- Transaction pooler on `6543`.

Prefer direct or session mode for the persistent API and migrations. Supabase
connections require TLS. Production defaults to certificate verification;
never disable TLS for Supabase. Download the project CA from Supabase Dashboard
**Database Settings > SSL Configuration** and inject its path with
`NODE_EXTRA_CA_CERTS` before Node starts. Do not put that setting only in
`backend/.env`, because Node initializes its trust store before dotenv loads.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are optional server-only values
for the REST read fallback. Keep `DB_READ_MODE=postgres` for PostgreSQL-only
core operation. Never place a service-role key or database credential in a
`VITE_*` variable.

Direct database configuration is intentionally fail-closed: `NODE_ENV=test`
requires an explicit `TEST_DATABASE_URL`. The `npm test` wrapper injects an
unreachable local sentinel when none is provided, so unit tests cannot reuse a
development or production URL.

Production additionally requires an HTTPS `FRONTEND_ORIGIN`,
`SESSION_STORE=postgres`, `COOKIE_SECURE=true`, an approved
`COOKIE_SAME_SITE`, and strong, distinct values for `JWT_SECRET`,
`SESSION_SECRET`, `CSRF_SECRET`, and `TWO_FACTOR_ENCRYPTION_KEY`. Optional
payment, shipping, waybill, tracking, email, OAuth, and Cloudinary configuration
stays empty until real credentials and verified contracts are available. Those
provider-backed features are **Blocked by credentials/configuration.** See
[Production Environment](../docs/PRODUCTION_ENVIRONMENT.md).

## Database lifecycle

Apply tracked migrations:

```bash
npm run migrate
```

Roll back the latest migration batch:

```bash
npm run migrate:down
```

Rollback may remove data. Use it only in a controlled local environment or an
explicitly approved recovery procedure, never as a routine shared-database step.

Do not run either `supabase-setup.sql` file, `alter.sql`, or the legacy scripts
under `src/database/migrate*.js`. Knex migrations are the only schema authority;
see [Database migrations](../docs/DATABASE_MIGRATIONS.md).

Verify the intended database before deployment:

```bash
npm run db:check
npm run migrations:verify
npm run migrate:status
npm run migrate:check
npm run security:verify-rls
npm run audit:integrity
```

`migrate:check` exits nonzero when migrations are pending; `migrate:status`
alone only prints that condition. The RLS verifier also rejects unsafe policies,
browser-role grants, and tables missing RLS. Stop the deployment if any command
fails. Legacy seed and schema entry points are intentionally non-executable.

## Development and test login fixtures

Use the fixture script only for local QA and automated E2E login checks. It is
blocked in `NODE_ENV=production`, requires `ENABLE_TEST_FIXTURES=true`, and
mutates only the listed `@test.local` users and their permission overrides.

```bash
ENABLE_TEST_FIXTURES=true npm run seed:test-fixtures
```

The script creates or resets these accounts:

```text
customer@test.local      customer
customer-alt@test.local  customer
cashier@test.local       cashier
staff-noperms@test.local store_staff with explicit permission denials
staff@test.local         store_staff with role permissions
owner@test.local         owner
superadmin@test.local    super_admin
disabled@test.local      disabled customer used for access-denial checks
```

The script generates a strong local password and writes it to
`backend/.test-credentials.local`, which is ignored by Git. Do not copy that
file into production. A caller may instead inject `TEST_FIXTURE_PASSWORD` from
its local process without recording it in the repository.

## Run the server

Development with automatic restart:

```bash
npm run dev
```

Production:

```bash
npm start
```

The API listens on `http://localhost:5000` by default. Local frontend requests
originate from `http://localhost:3000`.

## Useful endpoints

- `GET /api/health` is a process liveness check.
- `GET /api/ready` checks database connectivity, required core relations, and
  the PostgreSQL session table without disclosing secrets.
- `POST /api/auth/register` registers a customer.
- `POST /api/auth/login` creates a server-side session.
- `GET /api/auth/profile` returns the authenticated profile.
- `GET /api/products` and `GET /api/products/:id` return catalog data.

## Project structure

```text
backend/
|-- src/
|   |-- config/                     environment and database configuration
|   |-- controllers/                request handlers
|   |-- middleware/                 sessions, CSRF, validation, and RBAC
|   |-- routes/                     API routes
|   `-- server.js                   main server
|-- migrations/                     Knex up/down migrations
|-- scripts/                        diagnostics and verification commands
|-- knexfile.cjs                    Knex migration configuration
|-- .env                            local backend environment (ignored)
|-- .env.example                    redacted environment template
`-- package.json
```

## Security baseline

- bcrypt password hashing
- HttpOnly PostgreSQL-backed server sessions
- CSRF protection for authenticated mutations
- granular role and permission checks
- input validation and parameterized SQL
- allowlisted CORS origins
- sanitized database-outage responses on the hardened authentication and
  notification paths

## License

ISC
