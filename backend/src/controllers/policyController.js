import pool from '../config/database.js';

// Get policy by type (public)
export const getPolicyByType = async (req, res) => {
  try {
    const { type } = req.params;

    const validTypes = ['return_policy', 'privacy_policy', 'terms_of_service', 'shipping_policy'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid policy type' });
    }

    const result = await pool.query(
      'SELECT * FROM policies WHERE type = $1',
      [type]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get policy error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all policies (admin)
export const getAllPolicies = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM policies ORDER BY type ASC'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get all policies error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create or update policy (admin)
export const upsertPolicy = async (req, res) => {
  const { type } = req.params;
  const { title, content } = req.body;

  const validTypes = ['return_policy', 'privacy_policy', 'terms_of_service', 'shipping_policy'];

  if (!validTypes.includes(type)) {
    return res.status(400).json({ message: 'Invalid policy type' });
  }

  if (!title || !content) {
    return res.status(400).json({ message: 'Title and content are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO policies (type, title, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (type)
       DO UPDATE SET 
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [type, title, content]
    );

    res.json({
      message: 'Policy saved successfully',
      policy: result.rows[0]
    });
  } catch (error) {
    console.error('Upsert policy error:', error);
    res.status(500).json({ message: 'Failed to save policy' });
  }
};

// Delete policy (admin)
export const deletePolicy = async (req, res) => {
  const { type } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM policies WHERE type = $1 RETURNING *',
      [type]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    res.json({ message: 'Policy deleted successfully' });
  } catch (error) {
    console.error('Delete policy error:', error);
    res.status(500).json({ message: 'Failed to delete policy' });
  }
};
