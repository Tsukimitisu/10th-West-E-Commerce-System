import express from 'express';
import pool from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

const SETTINGS_CATEGORY = 'home';
const SETTINGS_KEY = 'announcements_enabled';

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }

  if (typeof value === 'number') return value !== 0;
  return fallback;
};

const getAnnouncementsEnabled = async () => {
  const result = await pool.query(
    'SELECT value FROM system_settings WHERE category = $1 AND key = $2 LIMIT 1',
    [SETTINGS_CATEGORY, SETTINGS_KEY],
  );

  if (!result.rows.length) return true;
  return toBoolean(result.rows[0]?.value, true);
};

const saveAnnouncementsEnabled = async (enabled, updatedBy = null) => {
  await pool.query(
    `INSERT INTO system_settings (category, key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (category, key)
     DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [SETTINGS_CATEGORY, SETTINGS_KEY, String(Boolean(enabled)), updatedBy],
  );
};

const toNullableTimestamp = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

// Public: get published announcements if global toggle is enabled
router.get('/', async (req, res) => {
  try {
    const enabled = await getAnnouncementsEnabled();
    if (!enabled) return res.json([]);

    const result = await pool.query(
      `SELECT * FROM announcements
       WHERE is_published = true
       ORDER BY COALESCE(published_at, created_at) DESC`,
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin/owner: get all announcements
router.get('/all', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin/owner: read global toggle status
router.get('/toggle', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const enabled = await getAnnouncementsEnabled();
    res.json({ enabled });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin/owner: update global toggle status
router.put('/toggle', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    if (typeof req.body?.enabled === 'undefined') {
      return res.status(400).json({ message: 'enabled is required' });
    }

    const enabled = toBoolean(req.body.enabled, true);
    await saveAnnouncementsEnabled(enabled, req.user?.id || null);

    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'announcement.toggle_visibility', JSON.stringify({ enabled }), req.ip],
    ).catch(() => {});

    res.json({ enabled });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin/owner: create announcement
router.post('/', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const isPublished = toBoolean(req.body?.is_published, false);
    const publishedAt = isPublished
      ? (toNullableTimestamp(req.body?.published_at) || new Date().toISOString())
      : null;

    const result = await pool.query(
      `INSERT INTO announcements (title, content, is_published, published_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title, content, isPublished, publishedAt],
    );

    res.status(201).json({ announcement: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin/owner: update announcement
router.put('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    const current = await pool.query('SELECT * FROM announcements WHERE id = $1 LIMIT 1', [req.params.id]);
    if (!current.rows.length) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    const existing = current.rows[0];
    const nextTitle = typeof req.body?.title === 'undefined' ? existing.title : String(req.body.title || '').trim();
    const nextContent = typeof req.body?.content === 'undefined' ? existing.content : String(req.body.content || '').trim();

    if (!nextTitle || !nextContent) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const hasPublishedFlag = typeof req.body?.is_published !== 'undefined';
    const nextPublished = hasPublishedFlag ? toBoolean(req.body.is_published, false) : existing.is_published;

    let nextPublishedAt;
    if (typeof req.body?.published_at !== 'undefined') {
      nextPublishedAt = toNullableTimestamp(req.body.published_at);
    } else if (hasPublishedFlag) {
      nextPublishedAt = nextPublished ? (existing.published_at || new Date().toISOString()) : null;
    } else {
      nextPublishedAt = existing.published_at;
    }

    const result = await pool.query(
      `UPDATE announcements
       SET title = $1,
           content = $2,
           is_published = $3,
           published_at = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [nextTitle, nextContent, nextPublished, nextPublishedAt, req.params.id],
    );

    res.json({ announcement: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin/owner: delete announcement
router.delete('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), async (req, res) => {
  try {
    await pool.query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
