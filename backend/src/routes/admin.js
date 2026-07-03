import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { USER_ROLES } from '../constants/schemaEnums.js';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { isDatabaseConnectivityError, shouldUseDatabaseReadFallback, supabaseRestFetch } from '../services/supabaseRest.js';
import { getPaymongoConfigurationStatus } from '../services/paymongo.js';
import { getShippingConfigurationStatus } from '../services/shipping/providers/index.js';
import { toPublicProviderStatus } from '../services/shipping/providers/providerUtils.js';
import { getShippingOperationalReadiness } from '../services/shipping/shippingReadiness.js';
import { getTrackingConfigurationStatus } from '../services/tracking/providers/index.js';

const router = express.Router();
const booleanRule = (value) => ['true', 'false'].includes(String(value).toLowerCase());
const numberRule = (min, max) => (value) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
const textRule = (max = 500) => (value) => typeof value === 'string' && value.trim().length <= max;
const SETTING_RULES = {
  store: { name: textRule(120), tagline: textRule(240), address: textRule(500), email: textRule(254), phone: textRule(50), logo_url: textRule(1000), currency: (v) => v === 'PHP', timezone: (v) => ['Asia/Manila', 'UTC'].includes(v) },
  payment: { cash_enabled: booleanRule, gcash_enabled: booleanRule },
  shipping: { enable_pickup: booleanRule, express_rate: numberRule(0, 100000), flat_rate: numberRule(0, 100000), free_threshold: numberRule(0, 1000000) },
  returns: { return_window_days: numberRule(0, 365) },
  tax: { enabled: booleanRule, inclusive: booleanRule, name: textRule(40), rate: numberRule(0, 100) },
  email: { from_email: textRule(254), from_name: textRule(120), order_confirmation: booleanRule, promotions: booleanRule, return_approval: booleanRule, shipping_update: booleanRule },
  home: { announcements_enabled: booleanRule },
  security: {
    '2fa_enforcement': (v) => ['disabled', 'optional', 'required'].includes(String(v)),
    lockout_duration_minutes: numberRule(1, 1440),
    max_login_attempts: numberRule(1, 20),
    password_min_length: numberRule(8, 128),
    password_require_lowercase: booleanRule,
    password_require_number: booleanRule,
    password_require_special: booleanRule,
    password_require_uppercase: booleanRule,
    session_timeout_minutes: numberRule(5, 10080),
  },
  system: { maintenance_mode: booleanRule },
};
const SENSITIVE_SETTING_PATTERN = /(secret|password|token|api[_-]?key|private[_-]?key)/i;
const maskSettingRows = (rows) => rows.map((row) => ({
  ...row,
  value: SENSITIVE_SETTING_PATTERN.test(row.key) ? '********' : row.value,
}));
const validateSettings = (category, settings) => {
  const rules = SETTING_RULES[category];
  if (!rules || !settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { error: 'Unsupported settings category or payload.' };
  }
  const normalized = {};
  for (const [key, rawValue] of Object.entries(settings)) {
    if (SENSITIVE_SETTING_PATTERN.test(key) || !rules[key]) {
      return { error: `Unsupported setting: ${category}.${key}` };
    }
    const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue);
    if (!rules[key](value)) return { error: `Invalid value for ${category}.${key}` };
    normalized[key] = value;
  }
  if (!Object.keys(normalized).length) return { error: 'At least one setting is required.' };
  return { normalized };
};

// Public settings reads are used by storefront pages.
router.get('/settings', authenticateToken, requireRole('super_admin', 'owner', 'admin'), requirePermission('settings.manage'), async (req, res) => {
  try {
    const { category } = req.query;
    if (shouldUseDatabaseReadFallback()) {
      const params = {
        select: '*',
        order: 'category.asc,key.asc',
      };
      if (category) {
        params.category = `eq.${category}`;
        params.order = 'key.asc';
      }
      const settings = await supabaseRestFetch('system_settings', params);
      return res.json(Array.isArray(settings) ? settings : []);
    }

    let result;
    if (category) {
      result = await pool.query('SELECT * FROM system_settings WHERE category = $1 ORDER BY key', [category]);
    } else {
      result = await pool.query('SELECT * FROM system_settings ORDER BY category, key');
    }
    res.json(maskSettingRows(result.rows));
  } catch (err) {
    console.error('Get settings error:', err);
    if (isDatabaseConnectivityError(err)) {
      return res.json([]);
    }
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/settings/:category', authenticateToken, requireRole('super_admin', 'owner', 'admin'), requirePermission('settings.manage'), async (req, res) => {
  try {
    if (shouldUseDatabaseReadFallback()) {
      const settings = await supabaseRestFetch('system_settings', {
        select: '*',
        category: `eq.${req.params.category}`,
        order: 'key.asc',
      });
      return res.json(Array.isArray(settings) ? settings : []);
    }

    const result = await pool.query('SELECT * FROM system_settings WHERE category = $1 ORDER BY key', [req.params.category]);
    res.json(maskSettingRows(result.rows));
  } catch (err) {
    console.error('Get settings by category error:', err);
    if (isDatabaseConnectivityError(err)) {
      return res.json([]);
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// All admin/system routes require super_admin only
router.use(authenticateToken, (req, res, next) => {
  if (req.path === '/settings' || req.path.startsWith('/settings/') || req.path.startsWith('/security/settings')) {
    return requireRole('super_admin', 'owner', 'admin')(req, res, () => (
      requirePermission('settings.manage')(req, res, next)
    ));
  }
  return requireRole('super_admin')(req, res, next);
});

router.get('/readiness', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    const paymongo = getPaymongoConfigurationStatus();
    const shipping = getShippingConfigurationStatus();
    const tracking = getTrackingConfigurationStatus();
    const activity = await getShippingOperationalReadiness(pool);
    return res.json({
      status: 'ready',
      database: 'ok',
      integrations: {
        paymongo: paymongo.configured ? 'configured' : 'blocked_by_credentials',
        shipping: {
          provider: shipping.provider,
          status: toPublicProviderStatus(shipping),
          ready: shipping.ready,
          country: String(process.env.SHIPPING_COUNTRY || 'PH').toUpperCase(),
          carrier: String(process.env.SHIPPING_CARRIER || 'jtexpress-ph').toLowerCase(),
          coverage: 'selected_cities',
        },
        tracking: {
          provider: tracking.provider,
          status: toPublicProviderStatus(tracking),
          ready: tracking.ready,
          carrier: String(process.env.SHIPPING_CARRIER || 'jtexpress-ph').toLowerCase(),
        },
        gmail: process.env.EMAIL_USER && process.env.EMAIL_PASSWORD ? 'configured' : 'blocked_by_credentials',
        facebook: process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET ? 'configured' : 'blocked_by_credentials',
      },
      runtime: {
        session_store: process.env.SESSION_STORE === 'postgres' ? 'postgres' : 'memory_dev_mode',
        environment: process.env.NODE_ENV || 'development',
      },
      shipping_activity: {
        webhook_url: '/api/shipments/webhook',
        sender_configured: [
          process.env.SHIPPER_NAME,
          process.env.SHIPPER_PHONE,
          process.env.SHIPPER_ADDRESS_LINE1,
          process.env.SHIPPER_CITY,
          process.env.SHIPPER_POSTAL_CODE,
        ].every(Boolean),
        ...activity,
      },
      timestamp: new Date().toISOString(),
    });
  } catch {
    return res.status(503).json({ status: 'not_ready', database: 'unavailable', timestamp: new Date().toISOString() });
  }
});

// ==================== USER MANAGEMENT ====================

// Get all users (not just staff)
router.get('/users', async (req, res) => {
  try {
    const { role, status, search, page = 1 } = req.query;
    const limit = 20;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    const params = [];

    if (role) { params.push(role); where.push(`role = $${params.length}`); }
    if (status === 'active') where.push('is_active = true AND locked_until IS NULL');
    if (status === 'inactive') where.push('is_active = false');
    if (status === 'locked') where.push('locked_until IS NOT NULL AND locked_until > NOW()');
    if (search) { params.push(`%${search}%`); where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`); }

    const whereClause = where.join(' AND ');
    const countResult = await pool.query(`SELECT COUNT(*) FROM users WHERE ${whereClause}`, params);
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT id, name, email, role, phone, is_active, login_attempts, locked_until, two_factor_enabled, last_login, created_at
       FROM users WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params
    );

    res.json({ users: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Lock user account
router.patch('/users/:id/lock', async (req, res) => {
  try {
    const { id } = req.params;
    // Lock indefinitely (far future date)
    await pool.query(
      `UPDATE users SET is_active = false, locked_until = NOW() + INTERVAL '100 years' WHERE id = $1`, [id]
    );
    // Invalidate all sessions
    await pool.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [id]);
    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'admin_lock_user', JSON.stringify({ locked_user_id: parseInt(id) }), req.ip]
    );
    res.json({ message: 'User account locked' });
  } catch (err) {
    console.error('Lock user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unlock user account
router.patch('/users/:id/unlock', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE users SET is_active = true, locked_until = NULL, login_attempts = 0 WHERE id = $1', [id]
    );
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'admin_unlock_user', JSON.stringify({ unlocked_user_id: parseInt(id) }), req.ip]
    );
    res.json({ message: 'User account unlocked' });
  } catch (err) {
    console.error('Unlock user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin reset password for any user
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
    // Invalidate all sessions so user must re-login
    await pool.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [id]);
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'admin_reset_password', JSON.stringify({ target_user_id: parseInt(id) }), req.ip]
    );
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user role
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const validRoles = USER_ROLES;
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    // Only super_admin can assign the super_admin role
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only Super Admin can assign the Super Admin role' });
    }
    // Prevent non-super_admin from modifying a super_admin user
    const targetUser = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    if (targetUser.rows.length > 0 && targetUser.rows[0].role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only Super Admin can modify another Super Admin' });
    }
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'admin_change_role', JSON.stringify({ target_user_id: parseInt(id), new_role: role }), req.ip]
    );
    res.json({ message: 'Role updated' });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user (any role)
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Can't delete yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const user = result.rows[0];
    // Invalidate sessions
    await pool.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [id]);
    // Remove permissions
    try { await pool.query('DELETE FROM user_permissions WHERE user_id = $1', [id]); } catch {}
    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    // Log
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'admin_delete_user', JSON.stringify({ deleted_user_id: parseInt(id), name: user.name, email: user.email, role: user.role }), req.ip]
    );
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== SYSTEM SETTINGS ====================

// Get all settings or by category
router.get('/settings', async (req, res) => {
  try {
    const { category } = req.query;
    let result;
    if (category) {
      result = await pool.query('SELECT * FROM system_settings WHERE category = $1 ORDER BY key', [category]);
    } else {
      result = await pool.query('SELECT * FROM system_settings ORDER BY category, key');
    }
    res.json(maskSettingRows(result.rows));
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get settings by category (route param)
router.get('/settings/:category', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings WHERE category = $1 ORDER BY key', [req.params.category]);
    res.json(maskSettingRows(result.rows));
  } catch (err) {
    console.error('Get settings by category error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update settings (bulk)
router.put('/settings', async (req, res) => {
  const { category, settings } = req.body;
  const validation = validateSettings(category, settings);
  if (validation.error) return res.status(400).json({ message: validation.error });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const beforeResult = await client.query('SELECT key, value FROM system_settings WHERE category = $1', [category]);
    for (const [key, value] of Object.entries(validation.normalized)) {
      await client.query(
        `INSERT INTO system_settings (category, key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (category, key) DO UPDATE SET value = $3, updated_by = $4, updated_at = NOW()`,
        [category, key, value, req.user.id]
      );
    }
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, ip_address, user_agent, before_data, after_data)
       VALUES ($1, 'settings.update', 'system_settings', $2, $3, $4, $5::jsonb, $6::jsonb)`,
      [req.user.id, category, req.clientIp, req.clientUa,
        JSON.stringify(Object.fromEntries(beforeResult.rows.map((row) => [row.key, row.value]))),
        JSON.stringify(validation.normalized)]
    );
    await client.query('COMMIT');
    res.json({ message: 'Settings saved' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update settings error:', err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// ==================== SECURITY ====================

// Get security settings
router.get('/security/settings', async (req, res) => {
  try {
    const result = await pool.query("SELECT key, value FROM system_settings WHERE category = 'security'");
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = SENSITIVE_SETTING_PATTERN.test(r.key) ? '********' : r.value; });
    res.json(settings);
  } catch (err) {
    console.error('Get security settings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update security settings
router.put('/security/settings', async (req, res) => {
  const validation = validateSettings('security', req.body.settings);
  if (validation.error) return res.status(400).json({ message: validation.error });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const beforeResult = await client.query("SELECT key, value FROM system_settings WHERE category = 'security'");
    for (const [key, value] of Object.entries(validation.normalized)) {
      await client.query(
        `INSERT INTO system_settings (category, key, value, updated_by, updated_at)
         VALUES ('security', $1, $2, $3, NOW())
         ON CONFLICT (category, key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, value, req.user.id]
      );
    }
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, ip_address, user_agent, before_data, after_data)
       VALUES ($1, 'settings.security.update', 'system_settings', 'security', $2, $3, $4::jsonb, $5::jsonb)`,
      [req.user.id, req.clientIp, req.clientUa,
        JSON.stringify(Object.fromEntries(beforeResult.rows.map((row) => [row.key, row.value]))),
        JSON.stringify(validation.normalized)]
    );
    await client.query('COMMIT');
    res.json({ message: 'Security settings updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update security settings error:', err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Get login attempts
router.get('/security/login-attempts', async (req, res) => {
  try {
    const { email, success, limit = 100 } = req.query;
    let where = ['1=1'];
    const params = [];
    if (email) { params.push(`%${email}%`); where.push(`email ILIKE $${params.length}`); }
    if (success !== undefined) { params.push(success === 'true'); where.push(`success = $${params.length}`); }
    params.push(parseInt(limit));
    const result = await pool.query(
      `SELECT * FROM login_attempts WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length}`, params
    );
    // Summary stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as today_total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND success = false) as today_failed,
        COUNT(DISTINCT ip_address) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as unique_ips
      FROM login_attempts
    `);
    const lockedResult = await pool.query(
      "SELECT COUNT(*) FROM users WHERE locked_until IS NOT NULL AND locked_until > NOW()"
    );
    res.json({
      attempts: result.rows,
      stats: {
        ...statsResult.rows[0],
        locked_accounts: parseInt(lockedResult.rows[0].count),
      }
    });
  } catch (err) {
    console.error('Get login attempts error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== MONITORING & LOGS ====================

// Get error logs
router.get('/logs/errors', async (req, res) => {
  try {
    const { type, limit = 100 } = req.query;
    let where = ['1=1'];
    const params = [];
    if (type) { params.push(type); where.push(`error_type = $${params.length}`); }
    params.push(parseInt(limit));
    const result = await pool.query(
      `SELECT e.*, u.name as user_name FROM error_logs e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE ${where.join(' AND ')} ORDER BY e.created_at DESC LIMIT $${params.length}`, params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get error logs error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get transaction logs
router.get('/logs/transactions', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const result = await pool.query(
      `SELECT a.*, u.name as user_name FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.action LIKE 'order%' OR a.action LIKE 'payment%' OR a.action LIKE 'checkout%'
         OR a.action LIKE 'refund%' OR a.action LIKE 'pos%'
       ORDER BY a.created_at DESC LIMIT $1`, [parseInt(limit)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get transaction logs error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get suspicious activity
router.get('/logs/suspicious', async (req, res) => {
  try {
    // Multiple failed logins from same IP
    const failedLogins = await pool.query(`
      SELECT ip_address, COUNT(*) as attempt_count, MAX(created_at) as last_attempt,
        array_agg(DISTINCT email) as targeted_emails
      FROM login_attempts
      WHERE success = false AND created_at > NOW() - INTERVAL '1 hour'
      GROUP BY ip_address HAVING COUNT(*) >= 5
      ORDER BY attempt_count DESC LIMIT 20
    `);
    // Recently locked accounts
    const lockedAccounts = await pool.query(`
      SELECT id, name, email, login_attempts, locked_until, last_login
      FROM users WHERE locked_until IS NOT NULL AND locked_until > NOW()
      ORDER BY locked_until DESC LIMIT 20
    `);
    // Unusual admin activity (bulk operations)
    const bulkOps = await pool.query(`
      SELECT user_id, u.name, a.action, COUNT(*) as op_count
      FROM activity_logs a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.created_at > NOW() - INTERVAL '1 hour'
        AND (a.action LIKE '%delete%' OR a.action LIKE '%bulk%')
      GROUP BY user_id, u.name, a.action HAVING COUNT(*) >= 10
      ORDER BY op_count DESC LIMIT 20
    `);
    res.json({
      failed_login_clusters: failedLogins.rows,
      locked_accounts: lockedAccounts.rows,
      bulk_operations: bulkOps.rows,
    });
  } catch (err) {
    console.error('Get suspicious activity error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== BACKUP & RECOVERY ====================

// A real encrypted backup provider has not been implemented. This endpoint is
// deliberately fail-closed so the UI cannot report a recoverable backup.
router.post('/backup', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs
        (actor_user_id, action, entity_type, entity_id, ip_address, user_agent, metadata)
       VALUES ($1, 'backup.request_blocked', 'backup', 'provider', $2, $3, $4::jsonb)`,
      [
        req.user.id,
        req.ip,
        req.get('user-agent'),
        JSON.stringify({ reason: 'BACKUP_PROVIDER_NOT_CONFIGURED' }),
      ]
    );
    return res.status(503).json({
      message: 'Real backup provider is not configured.',
      code: 'BACKUP_PROVIDER_NOT_CONFIGURED',
      configured: false,
    });
  } catch (err) {
    console.error('Record blocked backup request error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get backup history
router.get('/backup/history', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, u.name as initiated_by_name FROM backup_history b
       LEFT JOIN users u ON u.id = b.initiated_by
       ORDER BY b.created_at DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get backup history error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
