import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import { logActivity } from '../middleware/activityLogger.js';

// ─── LIST STAFF ────────────────────────────────────────────────────
export const listStaff = async (req, res) => {
  const { page = 1, limit = 20, role, status, search } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT u.id, u.name, u.email, u.role, u.phone, u.avatar, u.is_active,
             u.last_login, u.created_at, u.two_factor_enabled,
             u.failed_login_attempts, u.oauth_provider,
             (SELECT COUNT(*) FROM activity_logs WHERE user_id = u.id) as action_count,
             (SELECT MAX(created_at) FROM activity_logs WHERE user_id = u.id) as last_activity
      FROM users u WHERE u.role IN ('admin','cashier')
    `;
    const params = [];
    let idx = 1;

    if (role) { query += ` AND u.role = $${idx++}`; params.push(role); }
    if (status === 'active') { query += ` AND u.is_active = true`; }
    if (status === 'inactive') { query += ` AND u.is_active = false`; }
    if (search) { query += ` AND (u.name ILIKE $${idx} OR u.email ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    query += ` ORDER BY u.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Count
    let countQuery = `SELECT COUNT(*) FROM users WHERE role IN ('admin','cashier')`;
    const cp = [];
    let ci = 1;
    if (role) { countQuery += ` AND role = $${ci++}`; cp.push(role); }
    if (status === 'active') countQuery += ` AND is_active = true`;
    if (status === 'inactive') countQuery += ` AND is_active = false`;
    if (search) { countQuery += ` AND (name ILIKE $${ci} OR email ILIKE $${ci})`; cp.push(`%${search}%`); ci++; }

    const countResult = await pool.query(countQuery, cp);

    res.json({
      staff: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
    });
  } catch (error) {
    console.error('List staff error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── GET SINGLE STAFF ──────────────────────────────────────────────
export const getStaff = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, phone, avatar, is_active, last_login, created_at,
              two_factor_enabled, oauth_provider, failed_login_attempts
       FROM users WHERE id = $1 AND role IN ('admin','cashier')`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Staff member not found' });

    // Get permissions
    const perms = await pool.query(
      `SELECT p.id, p.name, p.description, p.category, COALESCE(up.granted, true) as granted
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       LEFT JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = $1
       WHERE rp.role = $2
       UNION
       SELECT p.id, p.name, p.description, p.category, up.granted
       FROM user_permissions up
       JOIN permissions p ON p.id = up.permission_id
       WHERE up.user_id = $1 AND up.granted = true
         AND p.id NOT IN (SELECT permission_id FROM role_permissions WHERE role = $2)`,
      [req.params.id, result.rows[0].role]
    );

    res.json({ ...result.rows[0], permissions: perms.rows });
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── ADD STAFF ─────────────────────────────────────────────────────
export const addStaff = async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ message: 'Email already registered' });

    if (!['admin', 'cashier'].includes(role)) {
      return res.status(400).json({ message: 'Staff role must be admin or cashier' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, phone, is_active, email_verified)
       VALUES ($1, $2, $3, $4, $5, true, true)
       RETURNING id, name, email, role, phone, is_active, created_at`,
      [name, email, hashedPassword, role, phone]
    );

    await logActivity({
      userId: req.user.id,
      action: 'staff_created',
      entityType: 'user',
      entityId: result.rows[0].id,
      details: { name, email, role },
      ipAddress: req.clientIp,
      userAgent: req.clientUa,
    });

    res.status(201).json({ message: 'Staff member added', staff: result.rows[0] });
  } catch (error) {
    console.error('Add staff error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── EDIT STAFF ────────────────────────────────────────────────────
export const editStaff = async (req, res) => {
  const { name, email, role, phone, password } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM users WHERE id = $1 AND role IN (\'admin\',\'cashier\')', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Staff member not found' });

    let query = 'UPDATE users SET name = $1, email = $2, role = $3, phone = $4, updated_at = NOW()';
    const params = [name, email, role, phone];
    let idx = 5;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 12);
      query += `, password_hash = $${idx++}`;
      params.push(hashedPassword);
    }

    query += ` WHERE id = $${idx} RETURNING id, name, email, role, phone, is_active, created_at`;
    params.push(req.params.id);

    const result = await pool.query(query, params);

    await logActivity({
      userId: req.user.id,
      action: 'staff_edited',
      entityType: 'user',
      entityId: parseInt(req.params.id),
      details: { name, email, role, passwordChanged: !!password },
      ipAddress: req.clientIp,
      userAgent: req.clientUa,
    });

    res.json({ message: 'Staff member updated', staff: result.rows[0] });
  } catch (error) {
    console.error('Edit staff error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── TOGGLE ACTIVE STATUS ──────────────────────────────────────────
export const toggleStaffStatus = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 AND role IN ('admin','cashier')
       RETURNING id, name, email, role, is_active`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Staff member not found' });
    const staff = result.rows[0];

    // Invalidate sessions if deactivated
    if (!staff.is_active) {
      await pool.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [req.params.id]);
    }

    await logActivity({
      userId: req.user.id,
      action: staff.is_active ? 'staff_activated' : 'staff_deactivated',
      entityType: 'user',
      entityId: parseInt(req.params.id),
      details: { name: staff.name },
      ipAddress: req.clientIp,
      userAgent: req.clientUa,
    });

    res.json({ message: `Staff member ${staff.is_active ? 'activated' : 'deactivated'}`, staff });
  } catch (error) {
    console.error('Toggle staff status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── DELETE STAFF ──────────────────────────────────────────────────
export const deleteStaff = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email FROM users WHERE id = $1 AND role IN ('admin','cashier')`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Staff member not found' });

    // Don't allow deleting yourself
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const staff = result.rows[0];
    await pool.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM user_permissions WHERE user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);

    await logActivity({
      userId: req.user.id,
      action: 'staff_deleted',
      entityType: 'user',
      entityId: parseInt(req.params.id),
      details: { name: staff.name, email: staff.email },
      ipAddress: req.clientIp,
      userAgent: req.clientUa,
    });

    res.json({ message: 'Staff member deleted' });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── STAFF ACTIVITY LOG ────────────────────────────────────────────
export const getStaffActivity = async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT * FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    const count = await pool.query('SELECT COUNT(*) FROM activity_logs WHERE user_id = $1', [req.params.id]);

    res.json({
      logs: result.rows,
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(count.rows[0].count) / limit),
    });
  } catch (error) {
    console.error('Get staff activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── STAFF PERMISSIONS ─────────────────────────────────────────────
export const updateStaffPermissions = async (req, res) => {
  const { permissions } = req.body; // Array of { permission_id, granted }

  try {
    const staffResult = await pool.query(
      `SELECT id, name, role FROM users WHERE id = $1 AND role IN ('admin','cashier')`,
      [req.params.id]
    );
    if (staffResult.rows.length === 0) return res.status(404).json({ message: 'Staff member not found' });

    // Clear old custom permissions
    await pool.query('DELETE FROM user_permissions WHERE user_id = $1', [req.params.id]);

    // Insert new
    for (const perm of permissions) {
      await pool.query(
        'INSERT INTO user_permissions (user_id, permission_id, granted) VALUES ($1, $2, $3)',
        [req.params.id, perm.permission_id, perm.granted]
      );
    }

    await logActivity({
      userId: req.user.id,
      action: 'staff_permissions_updated',
      entityType: 'user',
      entityId: parseInt(req.params.id),
      details: { permissions },
      ipAddress: req.clientIp,
      userAgent: req.clientUa,
    });

    res.json({ message: 'Permissions updated' });
  } catch (error) {
    console.error('Update staff permissions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── ALL PERMISSIONS ───────────────────────────────────────────────
export const getAllPermissions = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM permissions ORDER BY category, name');
    res.json(result.rows);
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── STAFF PERFORMANCE ─────────────────────────────────────────────
export const getStaffPerformance = async (req, res) => {
  const { period = '30' } = req.query; // days

  try {
    const staffId = req.params.id;

    // Orders processed
    const ordersResult = await pool.query(
      `SELECT COUNT(*) as total_orders,
              COALESCE(SUM(total), 0) as total_revenue,
              COALESCE(AVG(total), 0) as avg_order_value
       FROM orders
       WHERE created_by = $1 AND created_at > NOW() - INTERVAL '${parseInt(period)} days'`,
      [staffId]
    );

    // Login activity
    const loginsResult = await pool.query(
      `SELECT COUNT(*) as login_count
       FROM activity_logs
       WHERE user_id = $1 AND action = 'login' AND created_at > NOW() - INTERVAL '${parseInt(period)} days'`,
      [staffId]
    );

    // Actions performed
    const actionsResult = await pool.query(
      `SELECT action, COUNT(*) as count
       FROM activity_logs
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${parseInt(period)} days'
       GROUP BY action ORDER BY count DESC LIMIT 10`,
      [staffId]
    );

    // Returns processed
    const returnsResult = await pool.query(
      `SELECT COUNT(*) as total_returns
       FROM returns
       WHERE processed_by = $1 AND created_at > NOW() - INTERVAL '${parseInt(period)} days'`,
      [staffId]
    );

    res.json({
      period: parseInt(period),
      orders: {
        totalOrders: parseInt(ordersResult.rows[0].total_orders),
        totalRevenue: parseFloat(ordersResult.rows[0].total_revenue),
        avgOrderValue: parseFloat(ordersResult.rows[0].avg_order_value),
      },
      logins: parseInt(loginsResult.rows[0].login_count),
      topActions: actionsResult.rows,
      returnsProcessed: parseInt(returnsResult.rows[0]?.total_returns || 0),
    });
  } catch (error) {
    console.error('Get staff performance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
