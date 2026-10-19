import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { formatCountdown } from '../hooks/useCountdown.js';

test('lockout countdown formats server-derived remaining seconds', () => {
  for (const [seconds, text] of [[0, '00:00'], [5, '00:05'], [163, '02:43'], [3600, '60:00']]) assert.equal(formatCountdown(seconds), text);
});

test('phone recovery uses authenticated API/CSRF layer and passes the one-time grant through navigation state', async () => {
  const api = await readFile(new URL('../services/api.js', import.meta.url), 'utf8');
  const phone = await readFile(new URL('../components/PhonePasswordRecovery.jsx', import.meta.url), 'utf8');
  const reset = await readFile(new URL('../pages/ResetPassword.jsx', import.meta.url), 'utf8');
  assert.match(api, /requestPhonePasswordReset = phone => authenticatedFetch/);
  assert.match(api, /verifyPhonePasswordReset = .* => authenticatedFetch/);
  assert.match(phone, /state: \{ resetToken: result.reset_token \}/);
  assert.doesNotMatch(phone, /(?:localStorage|sessionStorage|console\.|\?token=)/);
  assert.match(reset, /location.state\?\.resetToken/);
});
