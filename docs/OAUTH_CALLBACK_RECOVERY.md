# OAuth callback completion recovery

## Evidence and scope

The reported Google logs prove account linking and session save completed.
The previous frontend did NOT reject missing status immediately and already
used credentialed `/api/auth/profile` requests. However, it mapped profile
errors to a generic authentication failure without a retry, and its handled
ref plus effect cleanup could suppress completion during effect replay.
It also removed callback query parameters before asynchronous completion.
The exact production profile response status was not supplied; a successful
session save alone does not prove the browser sent the session cookie back.

The deployed read-only verifier passed session-cookie issuance, CORS, no-store
CSRF, exact Google/Facebook callback URLs, production proxy/PostgreSQL sessions,
database and provider readiness. This does not complete provider consent.
There is no evidence in this task proving Facebook reached its callback or
that Meta accepted the redirect whitelist for the selected account/app.

## Updated contract

Success destinations:

```text
https://10th-west-e-commerce-system.vercel.app/#/oauth-callback?provider=google&status=success
https://10th-west-e-commerce-system.vercel.app/#/oauth-callback?provider=facebook&status=success
```

Failures use the same route, `status=failed` and an allowlisted `reason`.
No provider tokens or authorization codes are added. Existing legacy code
exchange remains supported. Missing status remains a pending session check.

The callback uses `/api/auth/profile`, credentials included, no-store, a
four-second request timeout, one transient retry after 500 ms and a nine-second
overall deadline. During this check, a 401 does not dispatch global session
expiry. Successful verification updates app auth state, clears OAuth error
flags, and replaces the callback route with the customer's intended path or
the existing staff/admin dashboard. CSRF refresh remains non-blocking;
mutation CSRF enforcement is unchanged. No token is read from localStorage.

## Deploy and verify

1. Deploy the backend and rebuild/redeploy Vercel with
   `VITE_API_URL=https://one0th-west-e-commerce-system.onrender.com/api`.
2. Keep production PostgreSQL sessions, stable secrets, Secure/HttpOnly/
   SameSite=None host-only cookies and exact credentialed Vercel CORS.
3. Run `node backend/scripts/verify-deployed-auth.js`.
4. Complete Google consent in a fresh browser session. Confirm the explicit
   success URL, then `/api/auth/profile` HTTP 200 and automatic navigation.
5. Refresh the destination and check cart/profile remain authenticated.
6. Repeat Facebook. If Meta shows URL Blocked and there is no
   `FACEBOOK_CALLBACK_RECEIVED`, inspect Meta's whitelist for the App ID whose
   last four characters appear in the backend start log. Use the exact Render
   `/api/auth/facebook/callback` URL, not the frontend callback route.
7. If the backend saved successfully but refresh fails, inspect the new
   `AUTH_PROFILE_REQUEST` booleans/status and `OAUTH_PROFILE_REFRESH_FAILED`
   browser status. Do not share cookies, CSRF tokens, provider codes or secrets.
   An authenticated_session=false after consent points to a missing/replaced
   session cookie; inspect the browser's cookie-blocking explanation. A retry
   cannot overcome third-party-cookie blocking. Same-site custom domains may
   be required; do not disable CSRF or fall back to tokens in callback URLs.
8. Smoke-test email/sample login, COD, signed PayMongo test webhook, cart,
   inventory/POS/listings and Manual J&T after deployment.

Local root `npm run dev` uses the same callback component and env-driven URLs.
Automated tests cover callback/session behavior and the existing regressions;
only a completed browser consent flow can certify deployed OAuth end to end.

## Verification performed

- Backend/frontend lint passed; backend suite passed 296 tests and frontend
  suite passed 69 tests. One earlier full run hit the existing timing-sensitive
  rate-limiter test; the subsequent complete run passed without changing it.
- Production frontend build passed with the actual Render API URL; the bundle
  scan found no localhost backend target or backend secret variable names.
- Database integrity audit passed (existing quarantined legacy records retained).
- Root development startup and local verifier passed, including both provider
  start redirects. Test servers were stopped afterward.
- Live deployment diagnostics passed, but these source changes still require
  deployment and fresh provider consent/browser verification.
