# Production authentication recovery

## Observed on 2026-09-05

The live Render API returned HTTP 200 from health, readiness and CSRF issuance.
CORS already allowed the exact Vercel origin with credentials. Google and
Facebook were configured, and both OAuth start routes returned HTTP 302 with
the correct Render callback.

However, `/api/csrf-token` issued only the auxiliary `csrf-token` cookie, with
no `twm.sid` session cookie. The OAuth start responses also lacked `twm.sid`.
A diagnostic request replayed every issued cookie and the freshly returned
CSRF header to `/api/auth/login` using deliberately invalid credentials. It
returned HTTP 403 `CSRF_INVALID_TOKEN`, before password validation.

The proven immediate cause is a missing session cookie: CSRF tokens bind to a
session ID, and without that cookie the next request starts a different session.
This is observable outside the browser, so browser third-party cookie blocking
does not explain the missing server header in this reproduction.

The source tied proxy recognition to `NODE_ENV=production` and explicitly
disabled session proxy trust otherwise. Render terminates HTTPS upstream.
A development NODE_ENV override on Render can therefore suppress a Secure
session cookie. The fix recognizes Render's platform flag and uses one proxy
trust decision for Express and express-session. Exact live environment values
still require confirmation in Render; they cannot be read from public endpoints.

Google's provider page returned HTTP 200 before consent during the check;
the reported Google 500 was not reproduced. No authenticated Google consent
was performed. Facebook's reported whitelist rejection requires the callback
to be registered in the Meta app used by the deployed App ID.

## Changes

- Shared session transport configuration recognizes `RENDER=true`, trusts one
  proxy hop on Render/production, and retains local HTTP/lax cookies.
- Secure session cookies remain HttpOnly, host-only, and SameSite=None for
  the configured cross-site deployment. No Domain override is added.
- CSRF issuance is `private, no-store`; its auxiliary cookie is also HttpOnly.
  The frontend obtains the token from the JSON response with credentials.
- Existing CSRF header submission and one-refresh/one-retry behavior remain.
  Login displays "Your session expired. Please refresh and try again." after
  an unrecoverable CSRF error.
- `/api/auth/readiness` exposes safe database/provider/transport diagnostics:
  allowed-origin result, secure request, cookie attributes, session-store type
  and cookie presence. It exposes no cookie value, session ID or secret.
- Production OAuth validation rejects callbacks on a different backend origin
  and HTTPS localhost, including Google callback aliases. Safe startup events
  `GOOGLE_PRODUCTION_CALLBACK_URL` and `FACEBOOK_PRODUCTION_CALLBACK_URL` show
  only configured public callback URLs.
- OAuth GET and exact PayMongo webhook CSRF exemptions remain intact. Payment
  signature verification remains required by the payment controller.

## Render environment

Set these non-secret values in the service Environment page and redeploy:

```env
NODE_ENV=production
FRONTEND_URL=https://10th-west-e-commerce-system.vercel.app
FRONTEND_ORIGIN=https://10th-west-e-commerce-system.vercel.app
BACKEND_URL=https://one0th-west-e-commerce-system.onrender.com
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
CSRF_COOKIE_SAME_SITE=none
SESSION_STORE=postgres
GOOGLE_CALLBACK_URL=https://one0th-west-e-commerce-system.onrender.com/api/auth/google/callback
FACEBOOK_CALLBACK_URL=https://one0th-west-e-commerce-system.onrender.com/api/auth/facebook/callback
```

Keep existing strong, stable, distinct secrets. Do not paste them in support
messages. Follow `DEPLOYMENT.md` for core secret requirements and verified
Supabase TLS. Do not set NODE_ENV=development or disable TLS verification as
a workaround for a production certificate/configuration error.

## Vercel environment

```env
VITE_API_URL=https://one0th-west-e-commerce-system.onrender.com/api
VITE_USE_SUPABASE=false
```

Redeploy the frontend after changing Vite build variables. The inspected live
frontend asset already referenced the correct Render API; the new build also
contains that API and no localhost API target.

## Provider console values

Google Cloud Console, Web OAuth client, Authorized redirect URIs:

```text
https://one0th-west-e-commerce-system.onrender.com/api/auth/google/callback
```

Authorized JavaScript origin:

```text
https://10th-west-e-commerce-system.vercel.app
```

Meta App Dashboard, Facebook Login settings, Valid OAuth Redirect URIs:

```text
https://one0th-west-e-commerce-system.onrender.com/api/auth/facebook/callback
```

Save the URI on the exact app whose App ID is configured in Render. Check
Web OAuth Login and Client OAuth Login settings and the app's mode/test-user
access. Do not add `/#/auth/callback` to the provider redirect URI; that is the
frontend destination after the backend has completed authentication.

Keep PayMongo's webhook at:

```text
https://one0th-west-e-commerce-system.onrender.com/api/payments/paymongo/webhook
```

## Verification and limits

Recorded results: backend/frontend lint pass; 280 backend tests and 64 frontend
tests pass; frontend build with the actual Render API URL passes. Bundle checks
found the Render API, no localhost API target, and no backend secret environment
names. All 47 migrations are applied and the integrity audit passes. Root
`npm run dev`, local readiness and both OAuth redirect verifiers pass. A local
fresh-cookie/CSRF probe reaches password validation and returns the expected
401 `INVALID_CREDENTIALS` for deliberately invalid credentials.

Before redeployment, the live verifier still reports missing session-cookie
issuance, absent no-store headers and the new diagnostics endpoint not available.
Live CORS and both exact OAuth redirect-URI checks already pass.

Run `node backend/scripts/verify-deployed-auth.js` after the new backend is
deployed. It checks cookie issuance, CORS, no-cache CSRF, exact provider
callbacks and safe deployment readiness without printing tokens or secrets.
A failure against the old deployment is expected until the new code/settings
are published. No production deployment or provider-console edits were made
by the source-code changes themselves.

Automated backend tests exercise a real Express session over a simulated
Render HTTPS proxy: issuance sets the Secure/HttpOnly/SameSite=None cookie,
matching CSRF succeeds, missing token/cookie is rejected, and OAuth GET/webhook
CSRF exemptions remain. Separate existing tests cover authentication, payment,
COD and Manual J&T behavior. Frontend tests cover the expiry message while
preserving invalid-credential and service-failure messages.

After deploying:

1. Open a fresh browser session on the Vercel frontend.
2. Check `/api/auth/readiness`: `request_secure=true`, `trust_proxy=1`,
   `session_store=postgres`, exact allowed origin and production cookie flags.
3. Fetch CSRF with credentials and verify `twm.sid` appears in Set-Cookie.
4. Sign in with email; verify the POST carries the cookie and CSRF header.
5. Complete Google and Facebook consent; verify profile and cart after return.
6. Refresh and confirm the session persists, then check COD and a PayMongo test
   payment with signed webhook confirmation.

If Set-Cookie is present but a browser refuses to store/send it, inspect that
browser's cookie-blocking reason. Same-site custom frontend/API domains may
be needed for users whose browsers block cross-site cookies.

References: [Render environment flags](https://render.com/docs/environment-variables),
[Express session proxy and secure-cookie behavior](https://expressjs.com/en/resources/middleware/session/).
