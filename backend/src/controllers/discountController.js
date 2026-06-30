import pool from '../config/database.js';

const parsePromotion = (body, partial = false) => {
  const value = {};
  const set = (key, next) => { if (!partial || Object.prototype.hasOwnProperty.call(body, key)) value[key] = next; };
  set('code', String(body.code || '').trim().toUpperCase());
  set('type', String(body.type || '').trim().toLowerCase());
  set('value', Number(body.value));
  set('min_purchase', Number(body.min_purchase || 0));
  set('max_discount', body.max_discount === null || body.max_discount === '' ? null : Number(body.max_discount));
  set('max_uses', body.max_uses === null || body.max_uses === '' ? null : Number(body.max_uses));
  set('per_user_limit', Number(body.per_user_limit || 1));
  set('is_active', body.is_active !== false);
  set('starts_at', body.starts_at || null);
  set('expires_at', body.expires_at || null);
  return value;
};

const validate = (promotion) => {
  if ('code' in promotion && !/^[A-Z0-9_-]{3,40}$/.test(promotion.code)) return 'Code must be 3 to 40 letters, numbers, underscores, or hyphens.';
  if ('type' in promotion && !['percentage', 'fixed'].includes(promotion.type)) return 'Type must be percentage or fixed.';
  if ('value' in promotion && (!Number.isFinite(promotion.value) || promotion.value <= 0)) return 'Value must be positive.';
  if (promotion.type === 'percentage' && promotion.value > 100) return 'Percentage cannot exceed 100.';
  for (const key of ['min_purchase', 'max_discount']) if (key in promotion && promotion[key] !== null && (!Number.isFinite(promotion[key]) || promotion[key] < 0)) return `${key} is invalid.`;
  for (const key of ['max_uses', 'per_user_limit']) if (key in promotion && promotion[key] !== null && (!Number.isInteger(promotion[key]) || promotion[key] <= 0)) return `${key} must be a positive integer.`;
  if (promotion.starts_at && promotion.expires_at && new Date(promotion.starts_at) >= new Date(promotion.expires_at)) return 'expires_at must be after starts_at.';
  return null;
};

export const listPromotions = async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  try {
    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM discounts WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit]),
      pool.query(`SELECT COUNT(*)::int AS total FROM discounts WHERE deleted_at IS NULL`),
    ]);
    return res.json({ data: rows.rows, pagination: { page, limit, total: count.rows[0].total } });
  } catch { return res.status(500).json({ message: 'Promotions could not be loaded.' }); }
};

export const createPromotion = async (req, res) => {
  const promotion = parsePromotion(req.body || {});
  const error = validate(promotion);
  if (error) return res.status(400).json({ message: error });
  try {
    const result = await pool.query(
      `INSERT INTO discounts (code,type,value,min_purchase,max_discount,max_uses,per_user_limit,is_active,starts_at,expires_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING *`,
      [promotion.code, promotion.type, promotion.value, promotion.min_purchase, promotion.max_discount, promotion.max_uses,
        promotion.per_user_limit, promotion.is_active, promotion.starts_at, promotion.expires_at]
    );
    return res.status(201).json(result.rows[0]);
  } catch (errorCaught) {
    return res.status(errorCaught.code === '23505' ? 409 : 500).json({ message: errorCaught.code === '23505' ? 'Promotion code already exists.' : 'Promotion could not be created.' });
  }
};

export const updatePromotion = async (req, res) => {
  const promotion = parsePromotion(req.body || {}, true);
  const error = validate(promotion);
  if (error) return res.status(400).json({ message: error });
  const allowed = ['code', 'type', 'value', 'min_purchase', 'max_discount', 'max_uses', 'per_user_limit', 'is_active', 'starts_at', 'expires_at'];
  const entries = Object.entries(promotion).filter(([key]) => allowed.includes(key));
  if (!entries.length) return res.status(400).json({ message: 'No valid fields supplied.' });
  const assignments = entries.map(([key], index) => `${key} = $${index + 2}`).join(', ');
  try {
    const result = await pool.query(`UPDATE discounts SET ${assignments}, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [req.params.id, ...entries.map(([, value]) => value)]);
    if (!result.rowCount) return res.status(404).json({ message: 'Promotion not found.' });
    return res.json(result.rows[0]);
  } catch (errorCaught) { return res.status(errorCaught.code === '23505' ? 409 : 500).json({ message: 'Promotion could not be updated.' }); }
};

export const deletePromotion = async (req, res) => {
  try {
    const result = await pool.query(`UPDATE discounts SET is_active = false, deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Promotion not found.' });
    return res.status(204).send();
  } catch { return res.status(500).json({ message: 'Promotion could not be deleted.' }); }
};
