import pool from '../config/database.js';

const parsePromotion = (body, partial = false) => {
  const value = {};
  const set = (key, next) => { if (!partial || Object.prototype.hasOwnProperty.call(body, key)) value[key] = next; };
  const number = (input, fallback) => input == null || (typeof input === 'string' && input.trim() === '') ? fallback
    : ['number', 'string'].includes(typeof input) ? Number(input) : NaN;
  set('code', typeof body.code === 'string' ? body.code.trim().toUpperCase() : '');
  set('type', typeof body.type === 'string' ? body.type.trim().toLowerCase() : '');
  set('value', number(body.value, NaN));
  set('min_purchase', number(body.min_purchase, 0));
  set('max_discount', number(body.max_discount, null));
  const maxUses = number(body.max_uses, null);
  set('max_uses', maxUses === 0 ? null : maxUses);
  set('per_user_limit', number(body.per_user_limit, 1));
  set('is_active', body.is_active === undefined ? true : body.is_active);
  set('starts_at', body.starts_at == null || body.starts_at === '' ? null : body.starts_at);
  set('expires_at', body.expires_at == null || body.expires_at === '' ? null : body.expires_at);
  return value;
};

const validDate = value => {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) return false;
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(new Date(value).getTime()) && Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10);
};

const validate = (promotion) => {
  if ('code' in promotion && !/^[A-Z0-9_-]{3,40}$/.test(promotion.code)) return 'Code must be 3 to 40 letters, numbers, underscores, or hyphens.';
  if ('type' in promotion && !['percentage', 'fixed'].includes(promotion.type)) return 'Type must be percentage or fixed.';
  if ('value' in promotion && (!Number.isFinite(promotion.value) || promotion.value <= 0)) return 'Value must be positive.';
  if (promotion.value > 99999999.99) return 'Value exceeds the maximum supported amount.';
  if (promotion.type === 'percentage' && promotion.value > 100) return 'Value must not exceed 100 for a percentage promotion.';
  for (const [key,label] of [['min_purchase','Minimum purchase'],['max_discount','Maximum discount']]) if (key in promotion && promotion[key] !== null && (!Number.isFinite(promotion[key]) || promotion[key] < 0)) return `${label} must be a non-negative amount.`;
  for (const [key,label,max] of [['min_purchase','Minimum purchase',99999999.99],['max_discount','Maximum discount',9999999999.99]]) if (promotion[key] > max) return `${label} exceeds the maximum supported amount.`;
  for (const [key,label] of [['max_uses','Maximum uses'],['per_user_limit','Per-user limit']]) if (key in promotion && promotion[key] !== null && (!Number.isInteger(promotion[key]) || promotion[key] <= 0 || promotion[key] > 2147483647)) return `${label} must be a positive whole number within the supported limit.`;
  if ('is_active' in promotion && typeof promotion.is_active !== 'boolean') return 'Active status must be true or false.';
  for (const [key,label] of [['starts_at','Start date'],['expires_at','End date']]) if (promotion[key] !== null && promotion[key] !== undefined && !validDate(promotion[key])) return `${label} must be a valid date.`;
  if (promotion.starts_at && promotion.expires_at && new Date(promotion.starts_at) >= new Date(promotion.expires_at)) return 'End date must be after start date.';
  return null;
};

const writeFailure = (res, error, operation) => {
  if (error.code === '23505') return res.status(409).json({ message: 'This promotion code already exists.' });
  if (['22003','22007','22008','22P02','23502','23514'].includes(error.code)) return res.status(400).json({ message: 'Promotion details exceed the supported limits. Check the value, minimum purchase, usage limits and dates.' });
  return res.status(500).json({ message: `Promotion could not be ${operation}. Please try again.` });
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
    return writeFailure(res,errorCaught,'created');
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
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM discounts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[req.params.id]);
    if (!current.rows.length) { await client.query('ROLLBACK');return res.status(404).json({ message: 'Promotion not found.' }); }
    const mergedError = validate({...parsePromotion(current.rows[0]),...promotion});
    if (mergedError) { await client.query('ROLLBACK');return res.status(400).json({ message: mergedError }); }
    const result = await client.query(`UPDATE discounts SET ${assignments}, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [req.params.id, ...entries.map(([, value]) => value)]);
    await client.query('COMMIT');
    return res.json(result.rows[0]);
  } catch (errorCaught) {
    await client?.query('ROLLBACK').catch(() => {});
    return writeFailure(res,errorCaught,'updated');
  } finally { client?.release(); }
};

export const deletePromotion = async (req, res) => {
  try {
    const result = await pool.query(`UPDATE discounts SET is_active = false, deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Promotion not found.' });
    return res.status(204).send();
  } catch { return res.status(500).json({ message: 'Promotion could not be deleted.' }); }
};
