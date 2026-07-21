# 10th West Moto - Team Setup Guide

This guide is for collaborators cloning the repo and running it locally.

## 1. Prerequisites

- Node.js 20+ (recommended)
- npm 10+
- Git
- A PostgreSQL/Supabase database connection

## 2. Clone and Install

```bash
git clone <your-repo-url>
cd 10th-west-moto
npm install
```

`npm install` will install both frontend and backend dependencies.

## 3. Environment Setup

### Backend

```bash
cp backend/.env.example backend/.env
```

Update `backend/.env` with real values. Minimum required to start backend:

- `DATABASE_URL` (recommended; `SUPABASE_DB_URL` is a supported alias)
- `JWT_SECRET`

For local browser access, `FRONTEND_ORIGIN=http://localhost:3000` is
recommended; that is also the development default.

`backend/.env` is the only environment file loaded by the backend, regardless
of the directory from which a command is run. Already-set process environment
variables take precedence. A root `.env` and frontend environment files are not
backend configuration sources.

Prefer setting only `DATABASE_URL`. If both database aliases are set, they must
contain exactly the same URL or startup fails. Tests are fail-closed:
direct database configuration with `NODE_ENV=test` requires an explicit
`TEST_DATABASE_URL`. The `npm test` wrapper supplies an unreachable local
sentinel when none is provided, preventing unit tests from falling back to a
development or production database.

Production startup also requires:

- `SESSION_STORE=postgres`
- `SESSION_SECRET`
- `CSRF_SECRET`
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE` set to `lax`, `strict`, or `none`
- `TWO_FACTOR_ENCRYPTION_KEY`

See `docs/PRODUCTION_ENVIRONMENT.md` for the full production checklist.

Payment, shipping, tracking, email, OAuth, and media integrations are optional
at core startup. Until their credentials and verified provider contracts are
available, their status is **Blocked by credentials/configuration.**

### Frontend

```bash
cp frontend/.env.example frontend/.env.local
```

Use backend mode by default:

- `VITE_API_URL=http://localhost:5000/api`

Direct browser access to application tables is disabled; all storefront data
passes through the backend.

## 4. Database Setup

Run tracked migrations (up):

```bash
npm run migrate
```

Roll back latest migration batch (down):

```bash
npm run migrate:down
```

This is a destructive rollback operation that may remove data. Use it only in
a controlled local or explicitly approved recovery workflow.

Deployment database checks:

```bash
npm --prefix backend run db:check
npm run migrate:status
npm --prefix backend run migrate:check
npm --prefix backend run migrations:verify
npm --prefix backend run security:verify-rls
npm --prefix backend run audit:integrity
```

Knex migrations are the only schema authority. The historical
`supabase-setup.sql` files are intentionally non-executable. See
`docs/DATABASE_MIGRATIONS.md`.

## 5. Run Locally

From repo root:

```bash
npm run dev
```

This starts:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000/api`

## 6. Useful Commands

```bash
npm run dev:frontend
npm run dev:backend
npm run build
```

## 7. Common Issues

- `CORS not allowed`:
  - Ensure `backend/.env` has `FRONTEND_ORIGIN=http://localhost:3000`
- Backend exits on startup:
  - One or more required env vars in `backend/.env` are missing/empty.
- API requests fail:
  - Ensure backend is running on port `5000` and frontend `VITE_API_URL` is correct.
