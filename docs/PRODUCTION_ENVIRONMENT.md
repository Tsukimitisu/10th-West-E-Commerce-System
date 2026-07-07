# Production Environment

The backend must fail fast when required core security configuration is missing.
Optional integrations must stay blocked until real credentials and provider
contracts are configured and verified.

## Required Core

Set these before running with `NODE_ENV=production`:

```env
NODE_ENV=production
FRONTEND_ORIGIN=
SESSION_SECRET=
SESSION_STORE=postgres
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
CSRF_SECRET=
TWO_FACTOR_ENCRYPTION_KEY=
JWT_SECRET=
DATABASE_URL=
```

`DATABASE_URL` may be replaced by `SUPABASE_DB_URL`.

## Optional Integrations

Leave these empty unless real provider credentials are available:

```env
PAYMONGO_PUBLIC_KEY=
PAYMONGO_SECRET_KEY=
PAYMONGO_WEBHOOK_SECRET=

SHIPPING_PROVIDER=bigseller
BIGSELLER_API_BASE_URL=
BIGSELLER_APP_KEY=
BIGSELLER_APP_SECRET=
BIGSELLER_ACCESS_TOKEN=
BIGSELLER_WEBHOOK_SECRET=
BIGSELLER_WAREHOUSE_ID=
BIGSELLER_JT_PH_VIP_CODE=

TRACKING_PROVIDER=aftership
AFTERSHIP_API_KEY=
AFTERSHIP_WEBHOOK_SECRET=

EMAIL_PROVIDER=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

The public `/api/ready` endpoint reports whether integrations are ready without
exposing secret names or values. Super Admin readiness may show safe missing
configuration categories, but never secret values.
