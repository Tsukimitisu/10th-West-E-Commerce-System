import assert from 'node:assert/strict';
import test, { after, afterEach, mock } from 'node:test';
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/lockout_test';
const { default: pool } = await import('../config/database.js');
const { recordPasswordFailure, loginLockResponse } = await import('./loginLockout.js');
afterEach(() => mock.restoreAll());
after(() => pool.end());

test('progressive locks use saved threshold and duration with fresh attempt sets', async () => {
  const user = { login_attempts: 0, login_lock_stage: 0, locked_until: null, login_security_locked_at: null };
  mock.method(pool, 'query', async (sql, args) => {
    assert.match(sql, /login_security_locked_at IS NULL/);
    assert.match(sql, /login_lock_stage < 3/);
    assert.match(sql, /locked_until IS NULL OR locked_until <= NOW\(\)/);
    if (!user.login_security_locked_at && !(user.locked_until > new Date())) {
      const next = user.locked_until ? 1 : user.login_attempts + 1;
      const stage = user.login_lock_stage;
      user.login_attempts = next;
      user.locked_until = next >= args[1] && stage < 2 ? new Date(Date.now() + args[2] * (stage + 1) * 60000) : null;
      if (next >= args[1]) user.login_lock_stage++;
      if (user.login_lock_stage === 3) user.login_security_locked_at = new Date();
    }
    return { rows: [{ ...user }] };
  });
  for (let stage = 1; stage <= 3; stage++) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const state = await recordPasswordFailure('rider@example.test', { max_login_attempts: 5, lockout_duration_minutes: 3 });
      assert.equal(state.login_attempts, attempt);
      assert.equal(state.login_lock_stage, attempt === 5 ? stage : stage - 1);
    }
    const res = { status(n) { this.statusCode = n; return this; }, set(k, v) { this[k] = v; return this; }, json(v) { this.body = v; return this; } };
    assert.ok(loginLockResponse(res, user));
    if (stage < 3) {
      assert.equal(res.statusCode, 429);
      assert.equal(res.body.code, 'ACCOUNT_TEMPORARILY_LOCKED');
      assert.ok(Math.abs(res.body.retry_after_seconds - stage * 180) <= 1);
      assert.equal(Number(res['Retry-After']), res.body.retry_after_seconds);
      assert.equal(loginLockResponse({}, { ...user, locked_until: new Date(0) }), false);
      user.locked_until = new Date(0);
    } else {
      assert.equal(res.body.code, 'ACCOUNT_RECOVERY_REQUIRED');
      assert.equal(res.body.retry_after_seconds, undefined);
    }
    assert.doesNotMatch(JSON.stringify(res.body), /rider|email|role|stage/);
  }
});
