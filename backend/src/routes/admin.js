import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All admin/system routes require super_admin only
router.use(authenticateToken, requireRole('super_admin'));

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
    const validRoles = ['customer', 'admin', 'cashier', 'super_admin', 'owner', 'store_staff'];
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
    res.json(result.rows);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get settings by category (route param)
router.get('/settings/:category', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings WHERE category = $1 ORDER BY key', [req.params.category]);
    res.json(result.rows);
  } catch (err) {
    console.error('Get settings by category error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update settings (bulk)
router.put('/settings', async (req, res) => {
  try {
    const { category, settings } = req.body;
    if (!category || !settings) {
      return res.status(400).json({ message: 'Category and settings required' });
    }
    for (const [key, value] of Object.entries(settings)) {
      const val = typeof value === 'string' ? value : JSON.stringify(value);
      await pool.query(
        `INSERT INTO system_settings (category, key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (category, key) DO UPDATE SET value = $3, updated_by = $4, updated_at = NOW()`,
        [category, key, val, req.user.id]
      );
    }
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'update_settings', JSON.stringify({ category, keys: Object.keys(settings) }), req.ip]
    );
    res.json({ message: 'Settings saved' });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==================== SECURITY ====================

// Get security settings
router.get('/security/settings', async (req, res) => {
  try {
    const result = await pool.query("SELECT key, value FROM system_settings WHERE category = 'security'");
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    console.error('Get security settings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update security settings
router.put('/security/settings', async (req, res) => {
  try {
    const { settings } = req.body;
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `INSERT INTO system_settings (category, key, value, updated_by, updated_at)
         VALUES ('security', $1, $2, $3, NOW())
         ON CONFLICT (category, key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, String(value), req.user.id]
      );
    }
    res.json({ message: 'Security settings updated' });
  } catch (err) {
    console.error('Update security settings error:', err);
    res.status(500).json({ message: 'Server error' });
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

// Create backup (exports tables as JSON)
router.post('/backup', async (req, res) => {
  try {
    const backupResult = await pool.query(
      `INSERT INTO backup_history (backup_type, status, initiated_by, created_at)
       VALUES ('manual', 'completed', $1, NOW()) RETURNING *`, [req.user.id]
    );
    // Get row counts for all tables as metadata
    const tables = ['users', 'products', 'orders', 'order_items', 'categories', 'returns', 'activity_logs'];
    const counts = {};
    for (const table of tables) {
      const r = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      counts[table] = parseInt(r.rows[0].count);
    }
    await pool.query(
      'UPDATE backup_history SET file_name = $1 WHERE id = $2',
      [`backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`, backupResult.rows[0].id]
    );
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'create_backup', JSON.stringify({ table_counts: counts }), req.ip]
    );
    res.json({ message: 'Backup created successfully', backup: backupResult.rows[0], table_counts: counts });
  } catch (err) {
    console.error('Create backup error:', err);
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
