# Render + Vercel release guide

Local startup remains `npm run dev` from the repository root. It starts one
frontend on 5173 and one backend on 5000. `backend/.env` is read before config;
platform environment variables take precedence. Never upload a populated .env.

## Hosting settings

| Setting | Render web service | Vercel project |
| --- | --- | --- |
| Root directory | backend | frontend |
| Install/build | npm ci | npm ci, then npm run build |
| Start/output | npm start | dist |
| Node | 24 LTS | 24 LTS |
| Health check | /api/ready | / |

`npm install` is also supported. Render supplies PORT; the API binds 0.0.0.0.
GET / returns public API information. /api/health checks the process;
/api/ready checks database/session schema. Vercel rewrites page paths to the
Vite entry point; HashRouter handles app navigation and normalized payment returns.

## Render environment

Replace URL placeholders with your actual domains. Create four independent
random secrets of at least 32 characters using a password manager. Keep the
session and encryption secrets stable across restarts and deployments.

```env
NODE_ENV=production
DATABASE_URL=
DB_READ_MODE=postgres
DB_SSL_MODE=verify-full
DB_POOL_MIN=0
DB_POOL_MAX=5
DB_CONNECTION_TIMEOUT_MS=10000
DB_QUERY_TIMEOUT_MS=10000
DB_STATEMENT_TIMEOUT_MS=10000
FRONTEND_URL=https://YOUR-VERCEL-FRONTEND.vercel.app
FRONTEND_ORIGIN=https://YOUR-VERCEL-FRONTEND.vercel.app
BACKEND_URL=https://YOUR-RENDER-BACKEND.onrender.com
JWT_SECRET=
SESSION_SECRET=
CSRF_SECRET=
TWO_FACTOR_ENCRYPTION_KEY=
SESSION_STORE=postgres
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
CSRF_COOKIE_SAME_SITE=none
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://YOUR-RENDER-BACKEND.onrender.com/api/auth/google/callback
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_CALLBACK_URL=https://YOUR-RENDER-BACKEND.onrender.com/api/auth/facebook/callback
PAYMENT_PROVIDER=paymongo
PAYMONGO_MODE=test
PAYMONGO_API_BASE_URL=https://api.paymongo.com/v1
PAYMONGO_PUBLIC_KEY=
PAYMONGO_SECRET_KEY=
PAYMONGO_WEBHOOK_SECRET=
PAYMONGO_SUCCESS_URL=https://YOUR-VERCEL-FRONTEND.vercel.app/payment/success
PAYMONGO_FAILED_URL=https://YOUR-VERCEL-FRONTEND.vercel.app/payment/failed
PAYMONGO_CANCEL_URL=https://YOUR-VERCEL-FRONTEND.vercel.app/payment/cancelled
PAYMONGO_ALLOWED_METHODS=gcash
PAYMONGO_CURRENCY=PHP
SHIPPING_PROVIDER=internal
SHIPPING_FEE_PROVIDER=internal
COURIER_PROVIDER=jnt
WAYBILL_PROVIDER=manual
TRACKING_PROVIDER=manual
JNT_COURIER_NAME=J&T Express
JNT_DEFAULT_SERVICE=standard
PHONE_VERIFICATION_PROVIDER=semaphore
PHONE_VERIFICATION_ENABLED=true
SEMAPHORE_API_KEY=
SEMAPHORE_SENDER_NAME=10THWEST
OTP_EXPIRY_MINUTES=5
OTP_CODE_LENGTH=6
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_DAILY_LIMIT=5
OTP_DEBUG_LOG_CODE=false
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
```

Retain the shipping fee, weight and distance settings from backend/.env.example
with the approved business values. Store Settings supply invoice contact data;
BUSINESS_NAME/PHONE/EMAIL/ADDRESS can override it. Remove stale PUBLIC_APP_URL,
Supabase alias URLs and CORS origins from earlier deployments. Add only explicit
additional HTTPS origins to CORS_ALLOWED_ORIGINS.

## Vercel environment

```env
VITE_API_URL=https://YOUR-RENDER-BACKEND.onrender.com/api
VITE_USE_SUPABASE=false
VITE_USE_MOCK=false
```

Redeploy after changing build variables. Only public values belong in VITE_*.
Cross-site cookies require HTTPS and SameSite=None on both session and CSRF
cookies. Browsers that block third-party cookies can still block cross-site
sessions; use same-site custom domains (shop.yourdomain and api.yourdomain)
for reliable support across browser privacy modes.

## Supabase and migrations

Copy the exact direct/session pooler connection from Supabase Connect; prefer
session mode port 5432 for persistent Render and Knex. URL-encode password
characters. Production defaults to verified TLS. If needed, upload the Supabase
CA as a Render secret file and set NODE_EXTRA_CA_CERTS to its absolute path
**before Node starts**. A paused project must be resumed in Supabase; the
API returns unavailable on database connectivity failures.

For the reported Render managed-pooler `SELF_SIGNED_CERT_IN_CHAIN` failure,
override the `verify-full` setting above with:

```env
NODE_ENV=production
DB_SSL_MODE=no-verify
SESSION_STORE=postgres
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
CSRF_COOKIE_SAME_SITE=none
```

This keeps TLS encryption but opts out of database-server certificate verification,
reducing protection against server impersonation. Use only for managed pooler
compatibility. An alternative is `DB_SSL_REJECT_UNAUTHORIZED=false`. Never set
`NODE_TLS_REJECT_UNAUTHORIZED=0`: that would affect all Node HTTPS integrations.
Supabase `DB_SSL_MODE=disable` remains rejected. All core secrets remain required.

`DB_SSL_MODE` overrides URI `sslmode`. `no-verify` always selects verification
off; otherwise the explicit boolean `DB_SSL_REJECT_UNAUTHORIZED` overrides the
mode's verification default. Without either override, production verifies
certificates (default `verify-full`); local `require` retains its existing behavior.
The selected policy is shared by pg runtime/session connections and Knex.
Redeploy after setting the override, then check `/api/ready` and run the database
checks below. Startup logs only safe connection metadata and a TLS compatibility
warning. Restore `verify-full` and remove the false override once a trusted CA is
configured. Do not switch the application to development mode on Render.

Before releasing traffic, run from the backend directory:

```sh
npm run verify:production-config
npm run db:check
npm run migrate:status
npm run migrate
npm run migrate:check
npm run audit:integrity
```

Use a controlled Render pre-deploy step (where supported) or release shell;
do not migrate inside each API request or each instance's startup. Keep a
database backup before migrations. The phone-verification migration is additive
and grants no browser database access. The strict config verifier reads the
current environment, never connects to providers, prints no values, and exits
nonzero for local or incomplete production settings. A pass does not validate
remote credential validity, account balances, callback registration or delivery.

## Provider consoles

Google: register the exact GOOGLE_CALLBACK_URL as a Web Application redirect,
and the frontend origin as an authorized JavaScript origin. Publish the consent
configuration or add authorized testers as required by the project mode.

Facebook: register FACEBOOK_CALLBACK_URL under Valid OAuth Redirect URIs,
configure the frontend app domain/privacy and data-deletion URLs, and use app
roles/testers while in development mode. Public users require the appropriate
Meta app mode and permissions. The application requests email; a missing email
fails safely.

PayMongo: create a webhook **in the same test/live mode as the keys** at
`https://YOUR-RENDER-BACKEND.onrender.com/api/payments/paymongo/webhook`.
Subscribe to checkout_session.payment.paid, payment.paid and payment.failed.
Store the matching signing secret on Render. Production hosting supports test
payments; te/li selection follows PAYMONGO_MODE. Both keys must use that mode.
Only signed webhooks commit payment/stock, and duplicate deliveries are safe.
Return URLs normalize into HashRouter with an order reference and poll the owned
order. A return URL is never proof of payment. Existing pending orders require
genuine provider event replay; never manually mark them paid to pass testing.

Semaphore: fund the account and get 10THWEST approved as a sender name. The
profile page sends codes only to the saved authenticated user's mobile number.
POST /api/auth/phone-verification/send and /verify require auth and CSRF.
GET /api/auth/phone-verification returns status. Codes are HMAC-hashed, expire,
are consumed once, and have per-account rolling daily limits and cooldowns.
Provider failure still consumes send quota to prevent SMS retry abuse. This is
phone ownership verification, not a replacement for email login or TOTP 2FA.

## Release verification

Run backend/frontend lint and tests and build frontend with the real public
VITE_API_URL. Verify no secrets in the bundle. Run `npm run verify:local` from
backend while root `npm run dev` is running, plus both OAuth local verifiers.
On the deployed URLs verify email login, Google/Facebook login and refresh,
profile SMS verification (correct/incorrect/expired/resend), Shop/cart, COD,
GCash test payment/webhook/replay, saved shipping address, Manual J&T waybill and
receipt, Inventory/POS/listings, approved returns/refunds and CSV/PDF exports.
Do not switch PayMongo to live until a signed test webhook has reconciled the
order and stock exactly once. Reconfigure both keys and the webhook secret
together when switching modes.

Official references: [Render](https://render.com/docs/deploy-node-express-app),
[Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite),
[Supabase TLS](https://supabase.com/docs/guides/platform/ssl-enforcement),
[Semaphore API](https://semaphore.co/docs).
