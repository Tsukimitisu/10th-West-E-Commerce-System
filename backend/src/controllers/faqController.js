import pool from '../config/database.js';

// Get all active FAQs (public)
export const getFAQs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM faqs 
       WHERE is_active = true 
       ORDER BY display_order ASC, created_at ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get FAQs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all FAQs including inactive (admin)
export const getAllFAQs = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM faqs ORDER BY display_order ASC, created_at ASC'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get all FAQs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single FAQ
export const getFAQById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM faqs WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'FAQ not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get FAQ error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create FAQ (admin)
export const createFAQ = async (req, res) => {
  const { question, answer, is_active, display_order } = req.body;

  if (!question || !answer) {
    return res.status(400).json({ message: 'Question and answer are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO faqs (question, answer, is_active, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [question, answer, is_active !== undefined ? is_active : true, display_order || 0]
    );

    res.status(201).json({
      message: 'FAQ created successfully',
      faq: result.rows[0]
    });
  } catch (error) {
    console.error('Create FAQ error:', error);
    res.status(500).json({ message: 'Failed to create FAQ' });
  }
};

// Update FAQ (admin)
export const updateFAQ = async (req, res) => {
  const { id } = req.params;
  const { question, answer, is_active, display_order } = req.body;

  try {
    const result = await pool.query(
      `UPDATE faqs 
       SET question = COALESCE($1, question),
           answer = COALESCE($2, answer),
           is_active = COALESCE($3, is_active),
           display_order = COALESCE($4, display_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [question, answer, is_active, display_order, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'FAQ not found' });
    }

    res.json({
      message: 'FAQ updated successfully',
      faq: result.rows[0]
    });
  } catch (error) {
    console.error('Update FAQ error:', error);
    res.status(500).json({ message: 'Failed to update FAQ' });
  }
};

// Delete FAQ (admin)
export const deleteFAQ = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM faqs WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'FAQ not found' });
    }

    res.json({ message: 'FAQ deleted successfully' });
  } catch (error) {
    console.error('Delete FAQ error:', error);
    res.status(500).json({ message: 'Failed to delete FAQ' });
  }
};
