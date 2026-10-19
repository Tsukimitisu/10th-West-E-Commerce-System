import { RESTORE_WRITE_LOCK, restoreUnavailable } from '../services/restoreControl.js';

const allowed = req => ['GET', 'HEAD'].includes(req.method) && (
  ['/', '/api/health', '/api/ready'].includes(req.path)
  || /^\/api\/admin\/backups\/restores\/[a-f\d-]{36}$/i.test(req.path)
);

// A separate small session pool keeps long HTTP write leases out of the normal
// query pool. Shared advisory leases let the recovery worker drain active writes.
export const createRestoreProtection = leasePool => {
  const lease = async () => {
    const client = await leasePool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL idle_in_transaction_session_timeout=0');
      const result = await client.query(`SELECT pg_try_advisory_xact_lock_shared($1) AS acquired,
        (SELECT maintenance FROM recovery_control.state WHERE id=1) AS maintenance`, [RESTORE_WRITE_LOCK]);
      if (!result.rows[0]?.acquired || result.rows[0].maintenance !== false) throw restoreUnavailable();
      return { release: async () => { await client.query('ROLLBACK').catch(() => {}); client.release(); } };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); client.release(); throw error; }
  };
  return {
    async middleware(req, res, next) {
      if (allowed(req) || !req.path.startsWith('/api/') || req.method === 'OPTIONS') return next();
      let held;
      try {
        held = await lease();
        let released = false;
        const release = () => { if (!released) { released = true; held.release().catch(() => {}); } };
        res.once('finish', release);
        // A disconnected browser does not cancel an async controller's SQL.
        // Keep its lease until the handler ends; a stuck handler makes the
        // worker's drain timeout abort safely instead of allowing overlapping writes.
        const end = res.end;
        res.end = function (...args) {
          const result = end.apply(this, args);
          if (this.destroyed) release();
          return result;
        };
        res.once('close', () => { if (res.writableFinished) release(); });
        return next();
      } catch {
        const error = restoreUnavailable();
        return res.status(503).json({ code: error.code, message: error.message });
      }
    },
    async run(task) {
      const held = await lease();
      try { return await task(); } finally { await held.release(); }
    },
  };
};
