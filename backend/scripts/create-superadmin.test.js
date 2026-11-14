import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { createSuperadmin, readSuperadminCredentials } from './create-superadmin.js';

const credentials = () => ({
  SUPERADMIN_EMAIL: '  SuperAdmin@example.test ',
  SUPERADMIN_PASSWORD: 'Isolated-Test-Password-84!',
  SUPERADMIN_NAME: '10th West Super Admin',
});

const database = (existing = null) => {
  const state = { account: existing && { ...existing }, writes: 0, sessionsRevoked: false, committed: false };
  const client = {
    async query(sql, values = []) {
      if (sql.startsWith('SELECT id, email, role')) {
        state.lookupEmail = values[0];
        return { rows: state.account ? [state.account] : [], rowCount: state.account ? 1 : 0 };
      }
      if (sql.includes('INSERT INTO users')) {
        state.writes++;
        state.account = { id: 101, name: values[0], email: values[1], password_hash: values[2], role: 'super_admin', is_active: true, email_verified: true, is_deleted: false };
        return { rows: [state.account], rowCount: 1 };
      }
      if (sql.startsWith('UPDATE users')) { state.writes++; state.account.password_hash = values[1]; }
      if (sql.startsWith('UPDATE sessions')) state.sessionsRevoked = true;
      if (sql === 'COMMIT') state.committed = true;
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { state, connect: async () => client };
};
const existingAdmin = () => ({ id: 101, email: 'superadmin@example.test', role: 'super_admin', password_hash: 'existing-hash', is_active: true, is_deleted: false, email_verified: true });

test('creates only the normalized requested Super Admin with a registration-compatible bcrypt hash', async () => {
  const db = database();
  const result = await createSuperadmin({ db, env: credentials() });
  assert.equal(result.outcome, 'created');
  assert.equal(db.state.account.role, 'super_admin');
  assert.equal(db.state.account.email, 'superadmin@example.test');
  assert.equal(db.state.account.is_active, true);
  assert.equal(db.state.account.email_verified, true);
  assert.notEqual(db.state.account.password_hash, credentials().SUPERADMIN_PASSWORD);
  assert.equal(bcrypt.getRounds(db.state.account.password_hash), 12);
  assert.equal(await bcrypt.compare(credentials().SUPERADMIN_PASSWORD, db.state.account.password_hash), true);
  assert.equal(db.state.writes, 1);
  assert.equal(db.state.committed, true);
});

test('an existing Super Admin is unchanged unless reset is explicit', async () => {
  const original = existingAdmin();
  const db = database(original);
  const result = await createSuperadmin({ db, env: credentials() });
  assert.equal(result.outcome, 'unchanged');
  assert.deepEqual(db.state.account, original);
  assert.equal(db.state.writes, 0);
  assert.equal(db.state.sessionsRevoked, false);
});

test('explicit password reset hashes the password and revokes sessions without changing the role/profile', async () => {
  const db = database(existingAdmin());
  const result = await createSuperadmin({ db, env: credentials(), resetPassword: true });
  assert.equal(result.outcome, 'password_reset');
  assert.equal(await bcrypt.compare(credentials().SUPERADMIN_PASSWORD, db.state.account.password_hash), true);
  assert.equal(db.state.account.role, 'super_admin');
  assert.equal(db.state.account.name, undefined);
  assert.equal(db.state.sessionsRevoked, true);
});

test('another role cannot be promoted or reset', async () => {
  for (const resetPassword of [false, true]) {
    const db = database({ ...existingAdmin(), role: 'customer' });
    await assert.rejects(createSuperadmin({ db, env: credentials(), resetPassword }), /another role/);
    assert.equal(db.state.writes, 0);
    assert.equal(db.state.committed, false);
  }
});

test('reset never reactivates, undeletes or verifies an existing disabled account', async () => {
  for (const change of [{ is_active: false }, { is_deleted: true }, { email_verified: false }]) {
    const db = database({ ...existingAdmin(), ...change });
    await assert.rejects(createSuperadmin({ db, env: credentials(), resetPassword: true }), /active, verified/);
    assert.equal(db.state.writes, 0);
  }
});

test('missing/weak credentials fail before database access without exposing their values', async () => {
  for (const env of [{}, { ...credentials(), SUPERADMIN_PASSWORD: 'weak' }, { ...credentials(), SUPERADMIN_PASSWORD: `${'A'.repeat(72)}a1!` }]) {
    let connections = 0;
    await assert.rejects(createSuperadmin({ db: { connect: () => { connections++; } }, env }));
    assert.equal(connections, 0);
  }
  assert.equal(readSuperadminCredentials(credentials()).email, 'superadmin@example.test');
});

test('existing role and permission middleware recognize super_admin without overrides', async () => {
  process.env.NODE_ENV = 'test';
  process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
  const { requireRole, requirePermission } = await import('../src/middleware/auth.js');
  const { default: pool } = await import('../src/config/database.js');
  try {
    const req = { user: { id: 101, role: 'super_admin' } };
    const res = { status() { throw new Error('Super Admin authorization was rejected'); } };
    let accepted = 0;
    requireRole('super_admin')(req, res, () => { accepted++; });
    await requirePermission('settings.manage')(req, res, () => { accepted++; });
    assert.equal(accepted, 2);
  } finally { await pool.end(); }
});
