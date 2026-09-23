import pool from '../config/database.js';

const normalizeText = (value, maxLength) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
};

const normalizeInput = (body = {}) => {
  const modelName = normalizeText(body.model_name ?? body.modelName, 160);
  const status = String(body.status || 'active').trim().toLowerCase();
  if (!modelName) throw Object.assign(new Error('Motorcycle model name is required.'), { status: 400 });
  if (!['active', 'inactive'].includes(status)) {
    throw Object.assign(new Error('Motorcycle model status must be active or inactive.'), { status: 400 });
  }
  return {
    modelName,
    brand: normalizeText(body.brand, 100),
    description: normalizeText(body.description, 2000),
    status,
  };
};

export const getMotorcycleModels = async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === 'true' && Boolean(req.user);
    const result = await pool.query(
      `SELECT model.*, COUNT(product.id)::int AS inventory_item_count
         FROM motorcycle_models model
         LEFT JOIN products product ON product.motorcycle_model_id = model.id
        WHERE ($1::boolean = true OR model.status = 'active')
        GROUP BY model.id
        ORDER BY model.status = 'active' DESC, LOWER(model.model_name)`,
      [includeInactive],
    );
    return res.json({ models: result.rows });
  } catch (error) {
    console.error('MOTORCYCLE_MODELS_LOAD_FAILED', { code: error.code, message: error.message });
    return res.status(500).json({ message: 'Motorcycle models could not be loaded.' });
  }
};

export const createMotorcycleModel = async (req, res) => {
  try {
    const model = normalizeInput(req.body);
    const result = await pool.query(
      `INSERT INTO motorcycle_models (model_name, brand, description, status)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [model.modelName, model.brand, model.description, model.status],
    );
    await req.logActivity?.('motorcycle_model.create', 'motorcycle_model', result.rows[0].id, { after: result.rows[0] });
    return res.status(201).json({ message: 'Motorcycle model added successfully.', model: result.rows[0] });
  } catch (error) {
    console.error('MOTORCYCLE_MODEL_CREATE_FAILED', { code: error.code, message: error.message });
    if (error.code === '23505') return res.status(409).json({ message: 'Motorcycle model already exists.', code: 'DUPLICATE_MOTORCYCLE_MODEL' });
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Motorcycle model could not be added.' });
  }
};

export const updateMotorcycleModel = async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid motorcycle model ID.' });
    const model = normalizeInput(req.body);
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM motorcycle_models WHERE id = $1 FOR UPDATE', [id]);
    if (!before.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Motorcycle model not found.' });
    }
    const result = await client.query(
      `UPDATE motorcycle_models
          SET model_name=$1, brand=$2, description=$3, status=$4, updated_at=NOW()
        WHERE id=$5 RETURNING *`,
      [model.modelName, model.brand, model.description, model.status, id],
    );
    await client.query('UPDATE products SET motorcycle_model=$1, updated_at=NOW() WHERE motorcycle_model_id=$2', [model.modelName, id]);
    await client.query('COMMIT');
    await req.logActivity?.('motorcycle_model.update', 'motorcycle_model', id, { before: before.rows[0], after: result.rows[0] });
    return res.json({ message: 'Motorcycle model updated successfully.', model: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('MOTORCYCLE_MODEL_UPDATE_FAILED', { code: error.code, message: error.message });
    if (error.code === '23505') return res.status(409).json({ message: 'Motorcycle model already exists.', code: 'DUPLICATE_MOTORCYCLE_MODEL' });
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Motorcycle model could not be updated.' });
  } finally {
    client.release();
  }
};
