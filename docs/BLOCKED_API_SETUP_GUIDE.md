# Blocked API and Deployment Setup Guide

This guide describes where each external credential belongs and how to verify
it without exposing secrets. It does not contain working keys. Never commit a
populated `.env` file, paste secrets into tickets, or put a server credential in
a `VITE_*` variable.

Use these placeholders throughout:

```text
FRONTEND_ORIGIN=https://<vercel-project>.vercel.app
BACKEND_ORIGIN=https://<render-service>.onrender.com
```

Replace the complete placeholder, including angle brackets. Production values
belong in the platform secret stores. A readiness result of `configured` means
required values are present; an actual provider request must still succeed
before the integration is considered operational.

## Current integration boundaries

| Capability | Current code status | Missing configuration result |
| --- | --- | --- |
| PostgreSQL and COD | Implemented; no payment provider required | Core readiness fails if PostgreSQL is unavailable |
| PayMongo / GCash | Implemented | `blocked_by_credentials` |
| BigSeller / J&T Express PH | Adapter shell only; approved private contract is still required | `blocked_by_credentials`, then `not_implemented` |
| PayRecon | No selectable adapter or environment contract | `implementation_needed` |
| AfterShip tracking | Implemented | `blocked_by_credentials` |
| TrackingMore | Reserved adapter shell, not selectable | `not_selected` or `implementation_needed` |
| Gmail SMTP | Implemented | `blocked_by_credentials` |
| Cloudinary | Implemented | `blocked_by_credentials` |
| Google and Facebook OAuth | Implemented | provider unavailable when its values are missing |

The safe public check is `GET BACKEND_ORIGIN/api/ready`. An authenticated Super
Admin can see provider-specific, non-secret categories at
`GET BACKEND_ORIGIN/api/admin/readiness`. Neither endpoint proves that a live
provider request succeeded.

## 1. Supabase PostgreSQL and API keys

Account and dashboard:

1. Create or open the project at [Supabase](https://supabase.com/dashboard).
2. Use **Connect** to copy an exact database URI. Do not reconstruct its host,
   region, or project-qualified username from memory.
3. Open **Project Settings > API Keys** for the project URL and server-side
   service-role key. Supabase's current key UI may also describe publishable and
   secret keys; use only a server-authorized key for the optional backend REST
   fallback.

Render environment variables:

```env
DATABASE_URL=<exact Supabase connection URI>
DB_SSL_MODE=verify-full
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only service-role key>
DB_READ_MODE=postgres
```

`DATABASE_URL` is required. `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are optional unless the Supabase REST fallback is
deliberately used. This application does not need a Supabase key in Vercel and
does not consume `SUPABASE_ANON_KEY` in the storefront. Never create a
`VITE_SUPABASE_SERVICE_ROLE_KEY`.

Connection modes:

- Direct `5432`: preferred for persistent servers and migrations when the
  network supports it.
- Session pooler `5432`: suitable for a persistent IPv4 connection and
  migrations.
- Transaction pooler `6543`: intended for transient/serverless workloads;
  avoid it for migration sessions where possible.

Supabase provides a project database rather than a separate sandbox product.
Use a separate non-production project for testing. Percent-encode reserved
password characters in the URI. Install the project CA using
`NODE_EXTRA_CA_CERTS` before Node starts and keep certificate verification on.

Verification:

```bash
npm --prefix backend run db:check
npm --prefix backend run migrate:status
npm --prefix backend run migrate:check
npm --prefix backend run audit:integrity
```

These commands must not print the full URI or password. If `DATABASE_URL` is
missing or unreachable, core readiness is `503`; if only the REST keys are
missing while `DB_READ_MODE=postgres`, core commerce remains available.

References: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[database connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
and [database roles and password encoding](https://supabase.com/docs/guides/database/postgres/roles).

## 2. Render backend environment

Account and dashboard:

1. Create or open the Node web service at [Render](https://dashboard.render.com/).
2. Open the service's **Environment** page.
3. Add production values as individual secret variables, save them, and deploy
   a new revision.

Required core values:

```env
NODE_ENV=production
DATABASE_URL=<Supabase URI>
BACKEND_URL=https://<render-service>.onrender.com
FRONTEND_ORIGIN=https://<vercel-project>.vercel.app
FRONTEND_URL=https://<vercel-project>.vercel.app
SESSION_STORE=postgres
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
CSRF_COOKIE_SAME_SITE=none
JWT_SECRET=<unique random value, at least 32 characters>
SESSION_SECRET=<different unique random value, at least 32 characters>
CSRF_SECRET=<different unique random value, at least 32 characters>
TWO_FACTOR_ENCRYPTION_KEY=<different unique random value, at least 32 characters>
```

Add alternate exact HTTPS frontend origins to `CORS_ALLOWED_ORIGINS` as a
comma-separated list. Do not use `*` with credentialed requests. Generate every
secret independently, store it only in Render, and redeploy after changes.
`BACKEND_URL` is required when OAuth is enabled because it constructs the exact
Google and Facebook callbacks.

Render has no special sandbox for environment variables; use a separate staging
service and non-production database/provider credentials. Verify:

```text
GET BACKEND_ORIGIN/api/health  -> 200 (process alive)
GET BACKEND_ORIGIN/api/ready   -> 200 with core_ready=true and commerce_ready=true
```

Optional integrations can keep `integrations_ready=false` without disabling
COD. A missing or unsafe core value blocks production startup. See
[Render environment variables](https://render.com/docs/configure-environment-variables).

## 3. Vercel frontend environment

Account and dashboard:

1. Open the frontend project at [Vercel](https://vercel.com/dashboard).
2. Go to **Project Settings > Environment Variables**.
3. Add the value for Production (and Preview only when its backend/CORS origin
   is deliberately configured):

```env
VITE_API_URL=https://<render-service>.onrender.com/api
```

This is the only frontend API base variable used by the current application.
Do not set it to localhost, do not omit `/api`, and do not add a trailing route
such as `/products`. No database, SMTP, OAuth secret, service-role key, or
provider secret belongs in Vercel. Vite exposes every `VITE_*` value to users.

There is no credential sandbox. Use a preview frontend with a staging backend
when needed. Vercel applies environment changes only to new deployments, so
redeploy and then verify in browser Network tools that requests target:

```text
BACKEND_ORIGIN/api/csrf-token
BACKEND_ORIGIN/api/products
```

The production build now fails when `VITE_API_URL` is absent, insecure, or
loopback. See [Vercel environment variables](https://vercel.com/docs/environment-variables)
and [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).

## 4. Gmail app password

Account and dashboard:

1. Use a dedicated store mailbox or approved Google Workspace account.
2. Enable **Google Account > Security > 2-Step Verification**.
3. Open **App passwords**, create one for this deployment, and copy the
   generated 16-character password once.

Render variables (the existing mail controllers use the `EMAIL_*` names):

```env
EMAIL_PROVIDER=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=<mailbox address>
EMAIL_PASSWORD=<app password, not the account password>
EMAIL_FROM="10th West Moto <mailbox@example.com>"
SUPPORT_EMAIL=<support destination>
```

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` are supported by the
readiness classifier, but populate the `EMAIL_*` names above because the
current registration, password, profile, and support mailers read them.

Gmail does not provide an SMTP sandbox. Use a non-customer test recipient and
then trigger a verification/password-reset email; confirm delivery and that no
password appears in logs. App passwords may be unavailable for organization
policies or Advanced Protection, and are revoked after a Google password
change. Missing values produce `blocked_by_credentials` or a safe email
delivery failure. Reference: [Google app passwords](https://support.google.com/accounts/answer/185833).

## 5. Cloudinary credentials

Account and dashboard:

1. Create a Cloudinary account and a separate product environment/cloud for
   staging if required.
2. In the Cloudinary Console, open **Settings > Access Keys** (or the API Keys
   panel shown for the product environment).
3. Create or rotate a key pair and record the cloud name, API key, and API
   secret.

Render variables:

```env
CLOUDINARY_CLOUD_NAME=<cloud name>
CLOUDINARY_API_KEY=<API key>
CLOUDINARY_API_SECRET=<server-only API secret>
CLOUDINARY_UPLOAD_ROOT=10th-west-moto-prod
```

Nothing belongs in Vercel. Use a separate cloud/root for staging; Cloudinary
does not make arbitrary production uploads into a reversible sandbox. Verify by
uploading a harmless test image through an authenticated application upload
flow, reading it back, and deleting it through that same flow. Readiness is
`blocked_by_credentials` if any of the three required values is missing.
Reference: [Cloudinary access-key management](https://support.cloudinary.com/hc/en-us/articles/202520942-Access-key-management-adding-and-removing-API-keys-and-secrets).

## 6. PayMongo API keys

Account and dashboard:

1. Create and verify the merchant account in the
   [PayMongo Dashboard](https://dashboard.paymongo.com/).
2. Open **Developers > API Keys**.
3. Start with test public and secret keys. Enable and obtain live credentials
   only after merchant/channel approval.
4. Under **Developers > Webhooks**, register the webhook and store its signing
   secret.

Render variables:

```env
PAYMONGO_PUBLIC_KEY=<pk_test_... or approved live public key>
PAYMONGO_SECRET_KEY=<sk_test_... or approved live secret key>
PAYMONGO_WEBHOOK_SECRET=<webhook signing secret>
PAYMONGO_WEBHOOK_TOLERANCE_SECONDS=300
PUBLIC_APP_URL=https://<vercel-project>.vercel.app
PAYMONGO_SUCCESS_URL=https://<vercel-project>.vercel.app/#/payment-result?order={orderId}&status=success
PAYMONGO_FAILED_URL=https://<vercel-project>.vercel.app/#/payment-result?order={orderId}&status=failed
PAYMONGO_CANCEL_URL=https://<vercel-project>.vercel.app/#/payment-result?order={orderId}&status=cancelled
```

Webhook URL:

```text
https://<render-service>.onrender.com/api/payments/paymongo/webhook
```

Use PayMongo test mode first and its documented channel test cases. Verify a
test checkout, signed webhook processing, idempotent replay, and final local
payment/order status. Never log the secret or webhook signature. If any of the
three key values is missing, PayMongo is `blocked_by_credentials`; COD remains
available and must not call PayMongo. References: [PayMongo API keys](https://docs.paymongo.com/do/docs/account-settings-api-keys),
[webhook setup](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management),
and [payment-channel testing](https://docs.paymongo.com/docs/payment-channels-testing).

## 7. BigSeller and J&T Express Philippines

Account and access path:

1. Create a BigSeller merchant account and connect the intended Philippine
   store and warehouse.
2. Complete J&T Express Philippines authorization in the BigSeller account.
3. Ask BigSeller support/account management for approved Open API access and
   the current private contract. If the account has no Open API/access-key page,
   that is a provider-access blocker rather than permission to infer endpoints.

Render variables reserved by this application:

```env
SHIPPING_PROVIDER=bigseller
SHIPPING_COUNTRY=PH
SHIPPING_CARRIER=jtexpress-ph
BIGSELLER_API_BASE_URL=<provider-issued base URL>
BIGSELLER_APP_KEY=<provider-issued app key>
BIGSELLER_APP_SECRET=<provider-issued app secret>
BIGSELLER_ACCESS_TOKEN=<provider-issued token>
BIGSELLER_WEBHOOK_SECRET=<provider-issued signing secret>
BIGSELLER_WAREHOUSE_ID=<connected warehouse ID>
BIGSELLER_JT_PH_VIP_CODE=<approved J&T PH logistics/channel code>
SHIPPER_NAME=<legal sender name>
SHIPPER_PHONE=<sender phone>
SHIPPER_EMAIL=<sender email>
SHIPPER_ADDRESS_LINE1=<pickup address>
SHIPPER_CITY=<pickup city>
SHIPPER_PROVINCE=<pickup province>
SHIPPER_BARANGAY=<pickup barangay>
SHIPPER_POSTAL_CODE=<pickup postal code>
SHIPPER_COUNTRY=PH
```

The application callback reserved for shipment/tracking events is:

```text
https://<render-service>.onrender.com/api/shipments/webhook
```

Ask the provider for a sandbox/test merchant, booking and cancellation
endpoints, waybill/label format, tracking endpoint, J&T PH channel identifier,
and webhook signature/replay rules. Credentials alone do **not** enable this
integration: the repository intentionally contains an adapter shell until that
contract is received and tested. Expected status progresses from
`blocked_by_credentials` to `not_implemented`, never a fake success. BigSeller's
public help confirms J&T Express PH operations but is not a complete API
contract: [BigSeller J&T PH help](https://help.bigseller.com/en_US/detailPage/21/1/4237/content/).

## 8. PayRecon

[PayRecon](https://payrecon.ph/) advertises payment reconciliation and custom
integration capabilities, but no public, current credential-creation path or
J&T Express Philippines API contract was confirmed for this application.

There are currently no `PAYRECON_*` variables, selectable provider, callback,
or implemented adapter in this repository. Do not invent them. Contact PayRecon
through its official sales/support channel and request:

- a sandbox account and supported Philippine payment/logistics scope;
- API base URL, authentication and rotation process;
- transaction/reconciliation schemas and idempotency rules;
- webhook URL/signature/replay contract;
- explicit confirmation of any J&T Express Philippines capability.

After receiving a written contract, implement and test an adapter before adding
environment variables or registering a webhook. Until then its expected status
is `implementation_needed`; it is not a deploy-time credential task.

## 9. AfterShip tracking

Account and dashboard:

1. Create an account at [AfterShip](https://admin.aftership.com/).
2. Open **Apps > API keys** (the Tracking API key page) and generate a key with
   the minimum required tracking permissions.
3. Open the webhook settings and create a webhook for tracking updates; retain
   the signing secret.

Render variables:

```env
TRACKING_PROVIDER=aftership
AFTERSHIP_API_BASE_URL=https://api.aftership.com/tracking/2026-01
AFTERSHIP_API_KEY=<server-only API key>
AFTERSHIP_WEBHOOK_SECRET=<webhook signing secret>
TRACKING_PROVIDER_TIMEOUT_MS=10000
```

Webhook URL:

```text
https://<render-service>.onrender.com/api/shipments/webhook
```

Use an AfterShip test/staging account or a non-customer tracking number where
the plan allows it. Confirm registration, refresh, a correctly signed webhook,
rejection of a bad signature, and idempotent event storage. The adapter pins an
API version; review AfterShip's migration guide before changing that URL. If
either key is absent, status is `blocked_by_credentials`. References:
[AfterShip quick start](https://www.aftership.com/docs/tracking/quickstart/api-quick-start),
[authentication](https://www.aftership.com/docs/tracking/quickstart/authentication),
and [webhooks](https://www.aftership.com/docs/tracking/webhook/webhook-overview).

## 10. TrackingMore

Account and dashboard:

1. Create a [TrackingMore](https://www.trackingmore.com/) account.
2. Open **Developer > API Key** and generate/copy the key; the provider may
   display it only once.
3. Request the current webhook signing contract and create a separate test key
   or account if offered by the selected plan.

Reserved Render variable names:

```env
TRACKINGMORE_API_BASE_URL=<provider-documented base URL>
TRACKINGMORE_API_KEY=<server-only API key>
TRACKINGMORE_WEBHOOK_SECRET=<provider-documented signing secret>
```

The intended callback would be
`https://<render-service>.onrender.com/api/shipments/webhook`, but do not
register production traffic yet. The TrackingMore adapter is a reserved shell
and is intentionally absent from the selectable provider registry. Setting
`TRACKING_PROVIDER=trackingmore` therefore does not enable it. Implement the
current API/authentication/webhook contract and provider tests first. Expected
status is `not_selected`, or `implementation_needed` if selected. References:
[generate a TrackingMore API key](https://support.trackingmore.com/en/article/generate-trackingmore-api-key-lhab6t/)
and [TrackingMore API introduction](https://support.trackingmore.com/en/article/introduction-of-trackingmore-api-7w0txr/).

## 11. Google OAuth client

Account and dashboard:

1. Create/select a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Configure **Google Auth Platform > Branding/Audience** and add test users
   while the app is in testing.
3. Under **Clients**, create an **OAuth client ID > Web application**.
4. Add this exact authorized redirect URI:

```text
https://<render-service>.onrender.com/api/auth/google/callback
```

Render variables:

```env
BACKEND_URL=https://<render-service>.onrender.com
GOOGLE_CLIENT_ID=<web client ID>
GOOGLE_CLIENT_SECRET=<web client secret>
```

No Google secret belongs in Vercel. Google OAuth supports a testing audience;
use named test users before publishing the consent screen. Verify
`GET BACKEND_ORIGIN/api/auth/providers` reports Google enabled, start
`GET BACKEND_ORIGIN/api/auth/google`, complete consent, and confirm the browser
returns to `FRONTEND_ORIGIN/#/oauth-callback` and exchanges a one-time code.
Missing values keep the route safely unavailable. Reference:
[Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server).

## 12. Facebook OAuth app

Account and dashboard:

1. Create an app at [Meta for Developers](https://developers.facebook.com/apps/).
2. Add the Facebook Login use case/product and configure its settings.
3. In **Facebook Login > Settings**, add this exact valid OAuth redirect URI:

```text
https://<render-service>.onrender.com/api/auth/facebook/callback
```

Render variables:

```env
BACKEND_URL=https://<render-service>.onrender.com
FACEBOOK_APP_ID=<app ID>
FACEBOOK_APP_SECRET=<server-only app secret>
```

No Meta secret belongs in Vercel. Keep the app in development mode and test
with app roles/test users before live review. Verify
`GET BACKEND_ORIGIN/api/auth/providers` reports Facebook enabled, start
`GET BACKEND_ORIGIN/api/auth/facebook`, complete consent, and confirm the
one-time frontend exchange succeeds. Missing values keep the route safely
unavailable. Reference: [Facebook Login for the web](https://developers.facebook.com/docs/facebook-login/web/).

## Production enablement checklist

For each provider, record the account owner, environment, credential rotation
date, least-privilege scope, webhook URL, and the evidence from one real test.
Then:

1. Add values only to Render or Vercel as designated above.
2. Redeploy the affected service; a saved variable does not alter an old Vite
   bundle.
3. Run database, lint, unit, E2E, readiness, and integrity checks.
4. Exercise provider test mode and verify signature rejection and idempotency.
5. Promote to live credentials only after the provider test passes.
6. Rotate immediately if a value appears in source, logs, screenshots, or chat.

Do not enable `mock` shipping/tracking in production. Do not mark any provider
working based only on the presence of environment variables.
