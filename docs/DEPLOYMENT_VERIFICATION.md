# Deployment verification — 2026-09-05

Source preparation is finished. The application has not been deployed to Render
or Vercel in this session. Production activation still needs the real domains,
provider console configuration, and a trusted Supabase TLS certificate chain.
Use [DEPLOYMENT.md](../DEPLOYMENT.md) for all environment keys and release steps.

## Hosting and provider results

| Area | Result |
| --- | --- |
| Render | Root directory `backend`; install `npm ci`; start `npm start`; binds `PORT` on `0.0.0.0`. Knex is a production dependency for release migrations. |
| Vercel | Root directory `frontend`; build `npm run build`; output `dist`. Added SPA fallback and retained HashRouter payment-return handling. |
| API URL | Production build requires a public HTTPS `VITE_API_URL` ending in `/api`. Local `npm run dev` keeps ports 5173/5000. |
| CORS/cookies | Exact production origins and credentialed requests retained. PostgreSQL sessions, secure/HttpOnly cookies and SameSite=None are documented and validated for Vercel/Render. |
| Supabase | 47 migrations applied; none pending. Added a protected phone-verification table. Existing data was preserved. |
| Production TLS | Certificate verification is enforced and cannot be overridden by connection-string SSL options. A live read-only check returned `SELF_SIGNED_CERT_IN_CHAIN`; deployment needs the correct trusted CA, for example through `NODE_EXTRA_CA_CERTS`. TLS verification was not disabled. |
| Google | Local verifier passed 9/9; start redirects with HTTP 302. Production callback must match `BACKEND_URL` plus `/api/auth/google/callback`; frontend redirect must use the public frontend origin. |
| Facebook | Local verifier passed 10/10; start redirects with HTTP 302. Production callback must match `BACKEND_URL` plus `/api/auth/facebook/callback`. |
| PayMongo | Test/live webhook signature selection now follows `PAYMONGO_MODE`, independently of Node hosting mode. Paid/failed/idempotency regression tests pass. Checkout return URLs are validated against the frontend origin. Success URL alone remains unable to mark paid. |
| Semaphore | Added authenticated, CSRF-protected send/verify/status routes and profile UI. Codes are HMAC-hashed, expire, are consumed once, and enforce attempts, resend cooldown and rolling daily limits. Provider failures consume send quota. Automated tests use mocks and send no SMS. |
| Shipping | Internal fees and Manual J&T/waybill/tracking configuration documented. Existing shipping and commerce regression tests pass. |
| Secrets | Real `.env` files remain untracked and unchanged. No configured secret values were found in changed source or the 24 built frontend text files. This is a value scan, not a full historical secret audit. |

The required Render variables are listed completely in the Render environment
section of [DEPLOYMENT.md](../DEPLOYMENT.md). They include core security/database
settings, the canonical Google/Facebook variables, PayMongo keys and return
URLs, internal/manual shipping settings, Semaphore limits, and existing
SMTP/Cloudinary integrations. Vercel only needs public frontend build settings:
`VITE_API_URL`, `VITE_USE_SUPABASE=false`, and `VITE_USE_MOCK=false`.

## Checks executed

| Check | Result |
| --- | --- |
| Backend migration status | Pass: 47 complete, zero pending |
| Backend lint | Pass |
| Backend tests | Pass: 277 tests, including production validation, PayMongo signatures and OTP limits/consumption |
| Frontend lint | Pass |
| Frontend tests | Pass: 63 tests |
| Frontend production build | Pass using public placeholder `https://api.example.com/api`; this artifact must be rebuilt with the actual Render URL before deployment |
| Root `npm run dev` | Pass: one backend listener on 5000, one frontend listener on 5173; started processes were stopped after checks |
| `verify:local` | Pass: frontend, backend root, health, database readiness, providers and both OAuth start routes |
| `verify:google-local` | Pass: 9/9; unauthenticated profile/cart behave as expected |
| `verify:facebook-local` | Pass: 10/10; secret absent from readiness |
| `verify:production-config` with current local environment | Correctly fails: local environment lacks production domains/session/cookie/provider settings |
| Production verifier fixture | Pass with complete isolated production settings; rejects missing secrets, unsafe URLs, insecure cookies, memory sessions and invalid OTP limits |
| Integrity audit | Pass; 77 existing quarantined legacy orders remain unchanged |
| Backend dependency audit | Zero vulnerabilities after compatible updates and a `qs` 6.16 override |
| Chromium storefront smoke suite | Pass: 7/7; home, Shop, empty/error catalog, cart, protected routes |
| Live provider consent/payment/SMS | Not exercised; requires provider account interaction and deployed endpoint configuration |

The backend suite includes existing authentication, COD/PayMongo, shipping,
inventory, POS, storefront, return/refund and reporting checks. These automated
regressions are not a claim that every deployed customer journey was manually
completed. The in-app browser was unavailable; the existing Playwright smoke
suite provided local browser coverage.

## Files changed

- `backend/.env.example`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/migrations/202609050001_phone_verification.cjs`
- `backend/scripts/run-tests.cjs`
- `backend/scripts/verify-local.js`
- `backend/scripts/verify-production-config.js`
- `backend/src/config/databaseConfig.cjs`
- `backend/src/config/deployment.js`
- `backend/src/config/deployment.test.js`
- `backend/src/config/productionConfig.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/phoneVerification.js`
- `backend/src/routes/phoneVerification.test.js`
- `backend/src/server.js`
- `backend/src/services/coreReadiness.js`
- `backend/src/services/paymongo.js`
- `backend/src/services/phoneOtp.js`
- `backend/src/services/phoneOtp.test.js`
- `backend/src/services/shipping/shippingSetup.test.js`
- `frontend/.env.example`
- `frontend/vercel.json`
- `frontend/vite.config.ts`
- `frontend/components/customer/PhoneVerification.jsx`
- `frontend/pages/customer/Profile.jsx`
- `frontend/services/api.js`
- `frontend/tests/account-staff-issue-regression.test.js`
- `frontend/tests/customer-bug-regression.test.js`
- `DEPLOYMENT.md`
- `docs/PRODUCTION_ENVIRONMENT.md`
- `docs/DEPLOYMENT_VERIFICATION.md`

## Remaining release steps

1. Set the real Render/Vercel domains and stable backend secrets using
   `DEPLOYMENT.md`. Set Vercel's public API URL and rebuild.
2. Install the trusted Supabase CA where necessary and rerun production
   `db:check`, `verify:production-config`, migration status and integrity audit.
3. Register the exact production Google/Facebook callbacks in their consoles.
4. Register the PayMongo webhook on Render in the same mode as the keys and
   store its signing secret; confirm a real test payment and duplicate event
   reconcile payment/order/stock exactly once.
5. Verify Semaphore sender approval/credits and test code delivery, wrong codes,
   expiry and resend limits on an authorized phone.
6. Complete the deployed login/session, cart, COD/GCash, Manual J&T, inventory,
   POS, listing, return/refund and export walkthrough in `DEPLOYMENT.md`.

Browsers can block third-party cookies even with correct SameSite=None settings.
Same-site custom domains for the shop and API provide more reliable session
support across browser privacy settings.
