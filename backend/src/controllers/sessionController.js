import pool from '../config/database.js';
import { securityPolicy } from '../services/securityPolicy.js';
import { getSessionTtlMs, sessionDeadline, sessionValiditySql } from '../services/sessionLifetime.js';

export const sessionAction = action => async (req, res) => {
  // Cookie-only extension: never expose or accept a replacement browser token.
  const auth = req.session?.auth;
  if (!auth?.tokenHash || Number(auth.userId) !== Number(req.user.id)) return res.status(401).json({ code: 'AUTH_SESSION_EXPIRED', message: 'Sign in again to continue.' });
  try {
    const policy = await securityPolicy.get();
    const params = [auth.tokenHash, req.user.id, policy.session_timeout_minutes];
    const prefix = action === 'state' ? 'SELECT *,NOW() AS server_now FROM sessions' :
      `UPDATE sessions SET last_active=NOW()${action === 'refresh' ? ',explicitly_refreshed_at=NOW(),expires_at=LEAST(created_at+($4 * INTERVAL \'1 millisecond\'),NOW()+make_interval(mins => $3))' : ''}`;
    if (action === 'refresh') params.push(getSessionTtlMs());
    const result = await pool.query(`${prefix} WHERE token_hash=$1 AND user_id=$2 AND is_active=true AND expires_at>NOW()
      AND ${sessionValiditySql()} ${action === 'state' ? '' : 'RETURNING *,NOW() AS server_now'}`, params);
    const row = result.rows[0];
    if (!row) return res.status(401).json({ code: 'AUTH_SESSION_EXPIRED', message: 'Your session has expired. Sign in again.' });
    const deadline = sessionDeadline(row, policy);
    if (req.session.cookie) req.session.cookie.maxAge = Math.max(0, deadline - Date.now());
    // authenticatedAt and MFA state are intentionally never renewed here.
    if (action !== 'state') await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.set('Cache-Control', 'no-store');
    return res.json({ expires_at: new Date(deadline).toISOString(), server_now: new Date(row.server_now).toISOString(), warning_seconds: 60 });
  } catch {
    return res.status(503).json({ code: 'SESSION_STATE_UNAVAILABLE', message: 'Session timing is temporarily unavailable. Please try again.' });
  }
};

export const getSessionState = sessionAction('state');
export const recordSessionActivity = sessionAction('activity');
export const refreshSession = sessionAction('refresh');
