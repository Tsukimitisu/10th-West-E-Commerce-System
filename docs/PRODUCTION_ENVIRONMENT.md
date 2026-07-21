# Production Environment

The API fails startup when required core security configuration is missing or
unsafe. Provider-backed features remain unavailable until their real
credentials and verified contracts are configured.

## Configuration source and precedence

`backend/.env` is the only environment file loaded by the backend, regardless
of the current working directory. Values already present in `process.env` take
precedence over the file. A root `.env`, `frontend/.env.local`, and other
frontend files are not backend configuration sources.

Use the deployment platform's encrypted environment or secrets manager in
production. Do not deploy a populated `.env` file and never commit credentials.

## Required core configuration

Inject every value below before starting the API:

```env
NODE_ENV=production
DATABASE_URL=
FRONTEND_ORIGIN=
JWT_SECRET=
SESSION_SECRET=
CSRF_SECRET=
TWO_FACTOR_ENCRYPTION_KEY=
SESSION_STORE=postgres
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
```

`DB_READ_MODE=postgres` is recommended for PostgreSQL-only core operation.
`CSRF_COOKIE_SAME_SITE` is optional and otherwise inherits `COOKIE_SAME_SITE`.

`FRONTEND_ORIGIN` must be one absolute HTTPS origin with no credentials, path,
query, or fragment. Additional `CORS_ALLOWED_ORIGINS` entries are validated as
absolute HTTPS origins too; do not use a wildcard with credentialed requests.

Each of the four secrets must be unique, non-placeholder, and at least 32
characters. Generate each value separately, for example:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Run the command once per secret and store each result only in the deployment
secret manager. Do not paste generated values into source files, build logs, or
support messages.

`SESSION_STORE=postgres` is mandatory. The readiness probe verifies database
connectivity, required core relations, and the `http_sessions` table. Production
also trusts the first reverse-proxy hop, so the TLS-terminating ingress must set
`X-Forwarded-Proto: https` and must not permit clients to forge forwarded
headers. `COOKIE_SAME_SITE=none` is appropriate only when a genuinely cross-site
frontend requires it; secure cookies remain mandatory.

## Supabase PostgreSQL connection

Copy the complete URI from Supabase Dashboard **Connect**. Do not construct a
host, region, username, or project reference from memory. Supabase exposes these
connection modes:

| Mode | Port | Recommended use |
| --- | ---: | --- |
| Direct | `5432` | Persistent API and migrations when network support allows it |
| Session pooler | `5432` | Persistent API and migrations when pooling or IPv4 is needed |
| Transaction pooler | `6543` | Constrained or serverless workloads |

Prefer direct or session mode for the long-running API and Knex migrations. A
pooler URI normally uses a project-qualified username; retain the exact username
shown by the dashboard. Percent-encode reserved password characters in the URI.

Prefer setting only `DATABASE_URL`. `SUPABASE_DB_URL` is a supported alias, not
an override. If both aliases are set, they must contain the same URL after
surrounding whitespace is trimmed or configuration fails. Already-set process
values win over `backend/.env`, so remove stale platform variables when rotating
a URL.

Supabase requires TLS. Production defaults to `verify-full` and this application
verifies the certificate chain for every enabled production SSL mode. Download
the project CA from **Database Settings > SSL Configuration**, then set
`NODE_EXTRA_CA_CERTS` in the process environment before Node starts. Defining it
only in `backend/.env` is too late for Node's trust-store initialization. Keep
`DB_SSL_MODE=verify-full`; never use `disable` for Supabase. Production startup
is blocked when the CA cannot be verified. See the official
[Supabase SSL enforcement guide](https://supabase.com/docs/guides/platform/ssl-enforcement).
Optional pool and timeout controls are documented in `backend/.env.example`.

Direct database configuration is fail-closed. `NODE_ENV=test` requires a
separate `TEST_DATABASE_URL`; the `npm test` wrapper supplies an unreachable
local sentinel when none is provided, preventing live-database fallback.

## Optional Supabase REST fallback

Core commerce operation supports `DB_READ_MODE=postgres` without a Supabase API
key. If the server-side REST read fallback is deliberately enabled, configure:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DB_READ_MODE=supabase_rest
```

The service-role key is server-only and bypasses row-level security. Never put
it in a `VITE_*` variable or browser bundle. The storefront does not need a
Supabase anon key because application data goes through the backend API. Forced
REST reads require `DB_READ_MODE=supabase_rest`. If `DB_READ_MODE` is unset, the
configured REST client is used automatically only during the bounded fallback
window after a PostgreSQL connectivity error.

## Optional integrations

Leave optional credentials empty until the actual provider account and contract
are available. Placeholder values do not make an integration operational.

| Capability | Intended provider | Deployment status |
| --- | --- | --- |
| Payment | PayMongo / GCash | **Blocked by credentials/configuration.** |
| Shipping | BigSeller / J&T Express Philippines | **Blocked by credentials/configuration.** |
| Waybill and label operations | BigSeller private API contract | **Blocked by credentials/configuration.** |
| Tracking | AfterShip; TrackingMore contract is not implemented | **Blocked by credentials/configuration.** |

Shipping and waybill work also requires BigSeller's approved private endpoint
contract; credentials alone are insufficient. Do not select either mock
shipping or mock tracking in production. Email, OAuth, and Cloudinary are also
optional and remain unavailable while their respective values are empty.

The public `/api/ready` response reports safe readiness categories and never
secret names or values. `integrations_ready=false` is expected while the
provider rows above are blocked.

## Deployment preflight

Run static and automated checks against the release candidate:

```bash
npm install
npm run lint
npm run test
npm run build
```

With the intended production database variables injected, verify the target:

```bash
npm --prefix backend run db:check
npm --prefix backend run migrations:verify
npm --prefix backend run migrate:status
npm --prefix backend run migrate:check
npm --prefix backend run security:verify-rls
npm --prefix backend run audit:integrity
```

`migrations:verify` is a source-only check. `migrate:check` is the database gate
that exits nonzero when any migration is pending; `migrate:status` is diagnostic
output and does not fail merely because it prints pending files. Stop if a check
fails. Apply tracked migrations through the controlled release
step, then repeat migration status, RLS verification, and the integrity audit:

```bash
npm --prefix backend run migrate
npm --prefix backend run migrate:status
npm --prefix backend run migrate:check
npm --prefix backend run security:verify-rls
npm --prefix backend run audit:integrity
```

There must be no pending migration before the new application version receives
traffic.

The Playwright E2E project launches development-mode servers and is not a
production startup proof. Run a separate process-level production smoke with
the production variables and trusted CA injected, then probe readiness through
the TLS-terminating ingress.

## Startup and readiness

Start the API only after the database preflight passes:

```bash
npm --prefix backend start
```

Probe the externally routed HTTPS endpoint at `/api/ready`. A deployment is core
ready only when the request succeeds and the response contains
`core_ready: true` and `commerce_ready: true`. A `503` means database
connectivity, schema, or the PostgreSQL session store is unavailable. The
`/api/health` endpoint proves only that the process is alive and must not be used
as the deployment readiness gate.
