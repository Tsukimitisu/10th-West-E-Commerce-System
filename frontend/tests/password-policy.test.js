import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DEFAULT_PASSWORD_POLICY, loadPasswordPolicy, normalizePasswordPolicy, passwordChecks, passwordPolicyError, passwordRequirementsText } from '../utils/passwordPolicy.js';

const relaxed = { password_min_length: 8, password_require_uppercase: false, password_require_lowercase: false, password_require_number: false, password_require_special: false };
test('relaxed policies accept passwords the backend accepts without inventing requirements', async () => {
  const { passwordPolicyError: backendError } = await import('../../backend/src/services/securityPolicy.js');
  assert.equal(passwordPolicyError('lowercase', relaxed), null);
  assert.equal(backendError('lowercase', relaxed), null);
  assert.deepEqual(passwordChecks('lowercase', relaxed).map(check => check.key), ['length']);
  assert.equal(passwordRequirementsText(relaxed), 'Password must be at least 8 characters.');
});
test('stricter policy validation and requirement text match the backend', async () => {
  const { passwordPolicyError: backendError } = await import('../../backend/src/services/securityPolicy.js');
  const strict = { ...DEFAULT_PASSWORD_POLICY, password_min_length: 16 };
  assert.match(passwordRequirementsText(strict), /at least 16 characters/);
  assert.deepEqual(passwordChecks('', strict).map(check => check.key), ['length', 'uppercase', 'lowercase', 'number', 'special']);
  for (const value of ['short', 'longlowercasepassword', 'LongPassword12345', 'LongPassword12345!', 'LongPassword12345?', 'LongPassword12345_', 'LongPassword12345!\n']) {
    assert.equal(passwordPolicyError(value, strict), backendError(value, strict), value);
  }
  const noSymbol = { ...strict, password_require_special: false };
  assert.equal(passwordPolicyError('LongPassword12345', noSymbol), null);
  assert.doesNotMatch(passwordRequirementsText(noSymbol), /special/);
});
test('policy fetch failure and malformed values use secure defaults; extra fields are discarded', async () => {
  assert.deepEqual(await loadPasswordPolicy(async () => { throw new Error('offline'); }), DEFAULT_PASSWORD_POLICY);
  assert.deepEqual(normalizePasswordPolicy({ password_min_length: 1, password_require_special: 'false', lockout_duration_minutes: 15, oauth_secret: 'private' }), DEFAULT_PASSWORD_POLICY);
  assert.deepEqual(await loadPasswordPolicy(async () => relaxed), relaxed);
  assert.deepEqual(normalizePasswordPolicy(null), DEFAULT_PASSWORD_POLICY);
});
test('Register, Reset and all Change Password forms use the same helper and refreshed effective policy', async () => {
  for (const file of ['pages/Register.jsx', 'pages/ResetPassword.jsx', 'pages/customer/Profile.jsx', 'components/operations/OperationsAccountView.jsx']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /usePasswordPolicy/); assert.match(source, /passwordPolicyError/); assert.match(source, /await refreshPolicy\(\)/);
    assert.doesNotMatch(source, /STRONG_PASSWORD_REGEX|passwordStrength < 5|password\.length < 8/);
    assert.match(source, /passwordChecks|passwordRequirementsText/);
  }
  const api = await readFile(new URL('../services/api.js', import.meta.url), 'utf8');
  assert.doesNotMatch(api, /STRONG_PASSWORD_REGEX/);
});
