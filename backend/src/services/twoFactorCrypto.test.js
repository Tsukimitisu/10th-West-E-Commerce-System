import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptTwoFactorSecret, encryptTwoFactorSecret, generateRecoveryCodes, hashRecoveryCode } from './twoFactorCrypto.js';

test('2FA secrets use authenticated encryption and recovery codes are one-way hashes', () => {
  process.env.TWO_FACTOR_ENCRYPTION_KEY = 'test-only-key-material-at-least-32-characters';
  const encrypted = encryptTwoFactorSecret('BASE32SECRET');
  assert.match(encrypted, /^v1\./);
  assert.doesNotMatch(encrypted, /BASE32SECRET/);
  assert.equal(decryptTwoFactorSecret(encrypted), 'BASE32SECRET');
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.notEqual(hashRecoveryCode(codes[0]), codes[0]);
});
