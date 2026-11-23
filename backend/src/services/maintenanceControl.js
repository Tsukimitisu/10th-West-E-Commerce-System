import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { decryptTwoFactorSecret } from './twoFactorCrypto.js';
import { writeAuditLog } from '../utils/audit.js';

export const maintenanceError = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
export const defaultMaintenanceMessage = 'We are taking care of the shop website. Please try again shortly. Your existing orders and payments are still being processed.';

// This storefront pause is independent of database-recovery protection.
// Ending it never clears recovery_control.state or releases a restore lock.

export async function readMaintenance(db) {
  const result = await db.query("SELECT key, value FROM system_settings WHERE category='system' AND key IN ('maintenance_mode','maintenance_details')");
  const values = Object.fromEntries(result.rows.map(row => [row.key, row.value]));
  if (values.maintenance_mode !== undefined && !['true', 'false'].includes(String(values.maintenance_mode).toLowerCase())) {
    throw maintenanceError('MAINTENANCE_STATUS_UNAVAILABLE', 'Store status could not be confirmed.', 503);
  }
  let details = {};
  try {
    const stored = typeof values.maintenance_details === 'string' ? JSON.parse(values.maintenance_details) : values.maintenance_details;
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) details = stored;
  } catch { /* Legacy metadata was not captured. */ }
  return { active: String(values.maintenance_mode).toLowerCase() === 'true',
    started_at: details.started_at || null, started_by: Number(details.started_by) || null,
    reason: typeof details.reason === 'string' ? details.reason.slice(0, 500) : null,
    message: typeof details.message === 'string' && details.message.trim() ? details.message.slice(0, 500) : defaultMaintenanceMessage };
}

// Fresh credentials are checked per change, using the same bcrypt/TOTP primitives
// as the existing privileged recovery confirmation. No credentials are persisted.
export async function changeMaintenance(db, actor, body, req) {
  if (typeof body?.active !== 'boolean' || body.acknowledgement !== true
    || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 500
    || (body.message !== undefined && (typeof body.message !== 'string' || body.message.length > 500))) {
    throw maintenanceError('MAINTENANCE_CONFIRMATION_REQUIRED', 'Confirm the impact and enter a reason (up to 500 characters).');
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const user = (await client.query('SELECT id, role, is_active, is_deleted, password_hash, two_factor_enabled, two_factor_secret FROM users WHERE id=$1 FOR SHARE', [actor])).rows[0];
    if (!user || user.role !== 'super_admin' || !user.is_active || user.is_deleted) throw maintenanceError('FORBIDDEN', 'Only a Super Admin may change maintenance mode.', 403);
    if (typeof body.password !== 'string' || body.password.length > 1024 || !user.password_hash || !await bcrypt.compare(body.password, user.password_hash)) {
      throw maintenanceError('FRESH_AUTH_REQUIRED', 'Your current password could not be verified.', 403);
    }
    if (user.two_factor_enabled) {
      let valid = false;
      try { valid = /^\d{6}$/.test(String(body.totp_code || '')) && speakeasy.totp.verify({ secret: decryptTwoFactorSecret(user.two_factor_secret), encoding: 'base32', token: String(body.totp_code), window: 1 }); } catch { /* Fail closed. */ }
      if (!valid) throw maintenanceError('FRESH_TOTP_REQUIRED', 'Enter a valid current authenticator code.', 403);
    }
    await client.query("INSERT INTO system_settings(category,key,value,updated_by) VALUES('system','maintenance_mode','false',$1) ON CONFLICT(category,key) DO NOTHING", [actor]);
    const current = await client.query("SELECT value FROM system_settings WHERE category='system' AND key='maintenance_mode' FOR UPDATE");
    const active = String(current.rows[0]?.value).toLowerCase() === 'true';
    if (active === body.active) throw maintenanceError('MAINTENANCE_STATE_UNCHANGED', active ? 'Maintenance is already active. Refresh the status.' : 'The store is already open normally. Refresh the status.', 409);
    const timestamp = (await client.query('SELECT NOW() AS changed_at')).rows[0].changed_at;
    const details = { started_at: body.active ? timestamp : null, started_by: body.active ? actor : null,
      reason: body.reason.trim(), message: (body.message || '').trim() || defaultMaintenanceMessage };
    for (const [key, value] of [['maintenance_mode', String(body.active)], ['maintenance_details', JSON.stringify(details)]]) {
      await client.query(`INSERT INTO system_settings(category,key,value,updated_by,updated_at) VALUES('system',$1,$2,$3,NOW())
        ON CONFLICT(category,key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()`, [key, value, actor]);
    }
    await writeAuditLog(client, { req, actorUserId: actor, action: body.active ? 'maintenance.started' : 'maintenance.ended',
      entityType: 'system_settings', entityId: 'maintenance_mode', beforeData: { active }, afterData: { active: body.active },
      metadata: { outcome: 'success', reason: body.reason.trim(), changed_at: timestamp } });
    await client.query('COMMIT');
    return { active: body.active, changed_at: timestamp };
  } catch (error) {
    await client.query('ROLLBACK');
    if (['FRESH_AUTH_REQUIRED', 'FRESH_TOTP_REQUIRED'].includes(error.code)) {
      await writeAuditLog(db, { req, actorUserId: actor, action: 'maintenance.change_failed',
        entityType: 'system_settings', entityId: 'maintenance_mode', metadata: { outcome: 'failed', status: error.code, reason: body.reason.trim() } }).catch(() => {});
    }
    throw error;
  } finally { client.release(); }
}
