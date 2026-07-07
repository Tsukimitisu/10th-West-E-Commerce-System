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

- `DATABASE_URL` (or `SUPABASE_DB_URL`)
- `JWT_SECRET`
- `SESSION_SECRET`
- `CSRF_SECRET`
- `FRONTEND_ORIGIN=http://localhost:5173`

Production startup also requires:

- `SESSION_STORE=postgres`
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE=lax`
- `TWO_FACTOR_ENCRYPTION_KEY`

See `docs/PRODUCTION_ENVIRONMENT.md` for the full production checklist.

Payment, shipping, tracking, email, OAuth, and media integrations are optional
at startup. Their features remain blocked until their real credentials are
configured; placeholders do not make an integration operational.

### Frontend

```bash
cp frontend/.env.example frontend/.env.local
```

Use backend mode by default:

- `VITE_USE_SUPABASE=false`
- `VITE_API_URL=http://localhost:5000/api`

Direct browser access to application tables is disabled. Keep
`VITE_USE_SUPABASE=false`; all storefront data must pass through the backend.

## 4. Database Setup

Run tracked migrations (up):

```bash
npm run migrate
```

Roll back latest migration batch (down):

```bash
npm run migrate:down
```

Optional migration status check:

```bash
npm run migrate:status
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
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000/api`

## 6. Useful Commands

```bash
npm run dev:frontend
npm run dev:backend
npm run build
```

## 7. Common Issues

- `CORS not allowed`:
  - Ensure `backend/.env` has `FRONTEND_URL=http://localhost:5173`
- Backend exits on startup:
  - One or more required env vars in `backend/.env` are missing/empty.
- API requests fail:
  - Ensure backend is running on port `5000` and frontend `VITE_API_URL` is correct.
