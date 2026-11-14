import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { LOGIN_LOCK_STORAGE_KEY, loginIdentifier, readLoginLock, saveLoginLock, clearLoginLock } from '../utils/loginLockState.js';

const store = () => {
  const data = new Map();
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
const email = 'rider@example.test';
const identifier = createHash('sha256').update(email).digest('hex');
const lock = { identifier, deadline: 2000, recovery: false };

test('email fingerprint uses SHA-256 after normalizing case and whitespace', async () => {
  assert.equal(await loginIdentifier('  RIDER@EXAMPLE.TEST  '), identifier);
  assert.notEqual(await loginIdentifier('different@example.test'), identifier);
});

test('only hashed identifier, deadline and recovery flag are persisted and restored', () => {
  const storage = store();
  saveLoginLock({ ...lock, email, password: 'private-password', token: 'private-token', otp: '123456' }, storage, 1000);
  assert.deepEqual(readLoginLock(storage, 1000), lock);
  assert.deepEqual(JSON.parse(storage.getItem(LOGIN_LOCK_STORAGE_KEY)), lock);
  assert.doesNotMatch(storage.getItem(LOGIN_LOCK_STORAGE_KEY), /rider@|password|token|otp|123456/);
  clearLoginLock(storage); assert.equal(storage.getItem(LOGIN_LOCK_STORAGE_KEY), null);
});

test('expired and malformed client metadata is removed automatically', () => {
  const storage = store();
  for (const value of [JSON.stringify(lock), '{bad-json', JSON.stringify({ ...lock, identifier: email }), JSON.stringify({ ...lock, deadline: 'tomorrow' }), JSON.stringify({ ...lock, deadline: 1e100 })]) {
    storage.setItem(LOGIN_LOCK_STORAGE_KEY, value);
    assert.equal(readLoginLock(storage, 2000), null);
    assert.equal(storage.getItem(LOGIN_LOCK_STORAGE_KEY), null);
  }
});

test('recovery-required client warnings are not persisted as untimed sign-in blocks', () => {
  const storage = store(); saveLoginLock(lock, storage, 1000);
  saveLoginLock({ identifier, deadline: null, recovery: true }, storage, 1000);
  assert.equal(storage.getItem(LOGIN_LOCK_STORAGE_KEY), null);
});

test('unavailable Web Crypto or storage does not break the in-memory countdown or persist raw email', async () => {
  const memory = await loginIdentifier(email, {});
  const storage = store(); saveLoginLock({ ...lock, identifier: memory }, storage, 1000);
  assert.equal(storage.getItem(LOGIN_LOCK_STORAGE_KEY), null);
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(readLoginLock(denied), null);
  assert.doesNotThrow(() => saveLoginLock(lock, denied, 1000));
  assert.doesNotThrow(() => clearLoginLock(denied));
});
