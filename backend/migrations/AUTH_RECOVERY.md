Authentication recovery rollout
===============================

Apply `202610200001_auth_recovery.cjs` through the existing migration runner
before deploying the new auth runtime. It adds two user lock fields and a
private, RLS-enabled SMS reset challenge table. No migration was applied to the
shared database during implementation. Existing rows start at stage zero.
The migration has a `down` implementation; roll back the application together
with the schema. Keep unrelated pending migrations in their existing order.

The saved `max_login_attempts` and `lockout_duration_minutes` remain authoritative:
one base pause, a double-length pause, then recovery required. A successful
password login, password reset or Super Admin unlock clears protection state.
Security unlock does not reactivate an administratively deactivated account.

No new provider or secret settings are required. SMS recovery uses the existing
phone verification enablement/provider, TextBee credentials and SESSION_SECRET.
An active local-password account needs exactly one matching verified phone
record, matching its current profile phone. Ambiguous shared numbers receive
the same generic response and no SMS. Email recovery remains available.

Recovery OTPs expire after five minutes, allow at most the existing configured
attempt limit (maximum five), and use the existing resend cooldown (minimum
60 seconds) and daily send cap. Provider latency is excluded from public
request responses. Delivery acceptance is recorded before a code can verify.
The one-time reset grant expires after ten minutes and uses the existing
hashed reset-token/password-policy/bcrypt/session-revocation pipeline.
Password reset preserves enrolled 2FA.

Before production rollout, apply/rollback on an isolated staging database and
exercise concurrent login failures against PostgreSQL. Verify one real TextBee
recovery and one Resend recovery with controlled accounts, including a locked
2FA-enabled account. Automated tests mock providers and database writes.

Changed files (32)
------------------

```text
backend/migrations/202610200001_auth_recovery.cjs
backend/migrations/AUTH_RECOVERY.md
backend/src/controllers/accountRecoveryPrivacy.test.js
backend/src/controllers/authController.js
backend/src/controllers/authLogin.test.js
backend/src/controllers/globalAuthPolicies.test.js
backend/src/controllers/staffController.js
backend/src/controllers/transactionalEmailAuth.test.js
backend/src/middleware/rateLimiter.js
backend/src/middleware/rateLimiter.test.js
backend/src/routes/admin.js
backend/src/routes/auth.js
backend/src/routes/securityPolicy.test.js
backend/src/routes/staff.js
backend/src/services/loginLockout.js
backend/src/services/loginLockout.test.js
backend/src/services/passwordRecovery.js
backend/src/services/passwordRecovery.test.js
backend/src/services/phoneOtp.js
backend/src/utils/masking.js
frontend/components/PhonePasswordRecovery.jsx
frontend/components/owner/StaffManagement.jsx
frontend/components/superadmin/LockedAccount.jsx
frontend/e2e/account-recovery.spec.js
frontend/hooks/useCountdown.js
frontend/pages/ForgotPassword.jsx
frontend/pages/Login.jsx
frontend/pages/ResetPassword.jsx
frontend/pages/superadmin/SystemSecurityView.jsx
frontend/pages/superadmin/UserManagementView.jsx
frontend/services/api.js
frontend/tests/accountRecovery.test.js
```
