import pool from '../config/database.js';

// All expressions read the old row. PostgreSQL serializes concurrent updates
// and rechecks the WHERE clause: a live lock cannot advance or extend itself.
export const recordPasswordFailure = async (email, policy) => {
  const next = '(CASE WHEN locked_until <= NOW() THEN 1 ELSE COALESCE(login_attempts, 0) + 1 END)';
  const result = await pool.query(`UPDATE users SET
    login_attempts = ${next},
    login_lock_stage = CASE WHEN ${next} >= $2 THEN login_lock_stage + 1 ELSE login_lock_stage END,
    locked_until = CASE WHEN ${next} >= $2 AND login_lock_stage < 2
      THEN NOW() + make_interval(mins => $3 * (login_lock_stage + 1)) ELSE NULL END,
    login_security_locked_at = CASE WHEN ${next} >= $2 AND login_lock_stage = 2
      THEN NOW() ELSE NULL END
    WHERE LOWER(email) = LOWER($1) AND login_security_locked_at IS NULL AND login_lock_stage < 3
      AND (locked_until IS NULL OR locked_until <= NOW())
    RETURNING login_attempts, login_lock_stage, locked_until, login_security_locked_at`,
  [email, policy.max_login_attempts, policy.lockout_duration_minutes]);
  if (result.rows[0]) return result.rows[0];
  // Another request may have acquired the lock while bcrypt was comparing.
  return (await pool.query(`SELECT login_lock_stage, locked_until, login_security_locked_at
    FROM users WHERE LOWER(email) = LOWER($1)`, [email])).rows[0];
};

export const loginLockResponse = (res, user, now = Date.now()) => {
  if (user?.login_security_locked_at || user?.login_lock_stage >= 3) {
    return res.status(429).json({ code: 'ACCOUNT_RECOVERY_REQUIRED',
      message: 'Sign-in is temporarily disabled. Reset your password or contact support to restore access.' });
  }
  const seconds = Math.ceil((new Date(user?.locked_until).getTime() - now) / 1000);
  if (!(seconds > 0)) return false;
  res.set('Retry-After', String(seconds));
  return res.status(429).json({ code: 'ACCOUNT_TEMPORARILY_LOCKED', retry_after_seconds: seconds,
    message: 'Too many failed sign-in attempts. Please wait before trying again.' });
};
