# AGENTS.md — 10th West Moto

## Layout
- `frontend/` — React 19 + Vite, Tailwind via CDN (`index.html` config) + `index.css` tokens, HashRouter.
- `backend/` — Express + PostgreSQL (Supabase). `backend/.env` points at a **shared remote database**; avoid
  mutating flows (checkout, orders, inventory edits) when testing locally.
- Design source of truth: `design-system/MASTER.md` (tokens, components, anti-patterns). Read it before UI work.

## Verification commands
- `npm --prefix frontend run lint`
- `npm --prefix frontend test` — node:test suites; many are **source-regex contracts** on JSX files, so
  renaming classes/strings they assert will fail them. Update the assertion only when the change is intentional.
- `npm --prefix frontend run build` — requires `VITE_API_URL` to be a public `https://…/api` URL
  (vite.config validation). For a local compile check: `VITE_API_URL=https://api.example.com/api npm --prefix frontend run build`.
- `npm --prefix backend run lint`
- `npm --prefix backend test -- --test-timeout=60000` — the timeout flag prevents an indefinite hang:
  `src/controllers/profileAuthRegression.test.js` "email change" test currently times out (pre-existing).
- `npm --prefix backend run audit:integrity` — read-only integrity checks against the configured DB.
- E2E: `E2E_REUSE_SERVER=true npx playwright test <spec>` from `frontend/` with dev servers running
  (`npm --prefix backend run start`, `npm --prefix frontend run dev:frontend`). Fixture credentials load from
  `backend/.test-credentials.local`. The remote DB is slow; 8s heading assertions can flake.

## UI conventions
- Shared components: `components/ui/*` (BrandButton, StatusBadge, EmptyState, RichText, LoadingSkeleton),
  `components/operations/*` (PageHeader, SectionCard, MetricCard, FilterBar/SearchField, ActionDropdown),
  `components/owner/Modal.jsx` (focus-managed dialog). Extend these rather than adding near-duplicates.
- Stored rich text (product descriptions, policies) must be rendered with `components/ui/RichText.jsx`, never
  as raw HTML; previews use `richTextToPlainText` from `utils/richText.js`.
- `.operations-content` in `index.css` normalizes legacy dark utility classes in owner/staff views.
