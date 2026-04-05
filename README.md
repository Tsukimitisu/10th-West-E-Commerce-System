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
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `EMAIL_HOST`
- `EMAIL_USER`
- `EMAIL_PASSWORD`
- `EMAIL_FROM`
- `FRONTEND_URL=http://localhost:5173`

Note: placeholder values are fine for local development as long as they are non-empty.

### Frontend

```bash
cp frontend/.env.example frontend/.env.local
```

Use backend mode by default:

- `VITE_USE_SUPABASE=false`
- `VITE_API_URL=http://localhost:5000/api`

If you want direct Supabase mode, set `VITE_USE_SUPABASE=true` and fill Supabase keys.

## 4. Database Setup

Run SQL schema/seed in your Supabase SQL editor:

- `backend/supabase-setup.sql`

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

