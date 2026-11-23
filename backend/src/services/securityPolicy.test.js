import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import pool from '../config/database.js';
import { createSecurityPolicyService, SECURITY_DEFAULTS, passwordPolicyError, twoFactorRequirement } from './securityPolicy.js';
after(() => pool.end().catch(() => {}));

test('policy cache coalesces requests, expires, and invalidates after a save', async () => {
  let calls = 0, time = 0, min = '12';
  const service = createSecurityPolicyService({ now: () => time, db: { async query() { calls++; return { rows: [{ key: 'password_min_length', value: min }] }; } } });
  assert.deepEqual(await Promise.all([service.get(), service.get()]), [await service.get(), await service.get()]);
  assert.equal(calls, 1);
  min = '16'; service.invalidate(); assert.equal((await service.get()).password_min_length, 16);
  time = 30_001; await service.get(); assert.equal(calls, 3);
});
test('settings failure uses secure seeded defaults or retains the last known stronger policy', async () => {
  let fail = true;
  const service = createSecurityPolicyService({ db: { async query() { if (fail) throw new Error('private connection string'); return { rows: [{ key: 'password_min_length', value: '20' }, { key: '2fa_enforcement', value: 'required' }] }; } } });
  assert.deepEqual(await service.get(), SECURITY_DEFAULTS);
  fail = false; service.invalidate(); await service.get();
  fail = true; service.invalidate(); const retained = await service.get();
  assert.equal(retained.password_min_length, 20); assert.equal(retained['2fa_enforcement'], 'required');
});
test('invalid values and unknown settings cannot weaken policy', async () => {
  const service = createSecurityPolicyService({ db: { async query() { return { rows: [
    { key: 'password_min_length', value: '1' }, { key: 'max_login_attempts', value: '-1' },
    { key: 'session_timeout_minutes', value: '5.5' }, { key: 'password_require_special', value: 'garbage' },
    { key: '__proto__', value: 'bad' },
  ] }; } } });
  assert.deepEqual(await service.get(), SECURITY_DEFAULTS);
});
test('only configured password requirements apply consistently', () => {
  assert.equal(passwordPolicyError('CorrectPass123!', SECURITY_DEFAULTS), null);
  for (const value of ['short', 'alllowercase123!', 'ALLUPPERCASE123!', 'MissingNumbers!', 'MissingSymbol123']) assert.ok(passwordPolicyError(value, SECURITY_DEFAULTS));
  const relaxed = { ...SECURITY_DEFAULTS, password_require_uppercase: false, password_require_lowercase: false, password_require_number: false, password_require_special: false };
  assert.equal(passwordPolicyError('lowercase', relaxed), null);
});
test('required 2FA enrolls all roles; optional/disabled never bypass enrolled account challenges', () => {
  for (const role of ['customer', 'store_staff', 'cashier', 'owner', 'admin', 'super_admin']) {
    assert.equal(twoFactorRequirement({ role }, { ...SECURITY_DEFAULTS, '2fa_enforcement': 'required' }), 'enroll');
    assert.equal(twoFactorRequirement({ role }, SECURITY_DEFAULTS), null);
    for (const mode of ['optional', 'disabled', 'required']) {
      assert.equal(twoFactorRequirement({ role, two_factor_enabled: true }, { ...SECURITY_DEFAULTS, '2fa_enforcement': mode }), 'challenge');
      assert.equal(twoFactorRequirement({ role, two_factor_enabled: true }, { ...SECURITY_DEFAULTS, '2fa_enforcement': mode }, true), null);
    }
  }
});
