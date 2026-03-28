import pool from '../config/database.js';

const REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

let reviewSchemaEnsured = false;
let reviewSchemaPromise = null;

const normalizeReviewStatus = (review) => {
  if (!review) return REVIEW_STATUS.PENDING;
  if (review.review_status) return review.review_status;
  return review.is_approved ? REVIEW_STATUS.APPROVED : REVIEW_STATUS.PENDING;
};

const mapReviewRow = (row) => ({
  ...row,
  rating: Number(row.rating),
  verified_purchase: Boolean(row.verified_purchase),
  review_status: normalizeReviewStatus(row),
});

const ensureReviewSchema = async () => {
  if (reviewSchemaEnsured) return;
  if (reviewSchemaPromise) {
    await reviewSchemaPromise;
    return;
  }

  reviewSchemaPromise = (async () => {
    await pool.query(`
      ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS review_status VARCHAR(20),
      ADD COLUMN IF NOT EXISTS moderated_by INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS moderation_note TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    await pool.query(`
      UPDATE reviews
      SET review_status = CASE
        WHEN COALESCE(is_approved, false) = true THEN '${REVIEW_STATUS.APPROVED}'
        ELSE '${REVIEW_STATUS.PENDING}'
      END
      WHERE review_status IS NULL;
    `);

    await pool.query(`
      ALTER TABLE reviews
      ALTER COLUMN review_status SET DEFAULT '${REVIEW_STATUS.APPROVED}';
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(review_status);
    `);

    reviewSchemaEnsured = true;
  })();

  try {
    await reviewSchemaPromise;
  } finally {
    reviewSchemaPromise = null;
  }
};

const syncProductRating = async (productId) => {
  await pool.query(
    `
      UPDATE products p
      SET rating = stats.avg_rating
      FROM (
        SELECT
          $1::INTEGER AS product_id,
          COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)::DECIMAL(3, 1) AS avg_rating
        FROM reviews r
        WHERE r.product_id = $1
          AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN '${REVIEW_STATUS.APPROVED}' ELSE '${REVIEW_STATUS.PENDING}' END) = '${REVIEW_STATUS.APPROVED}'
      ) stats
      WHERE p.id = stats.product_id
    `,
    [productId],
  );
};

const getVerifiedPurchaseExpression = `
  EXISTS (
    SELECT 1
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = r.product_id
      AND o.user_id = r.user_id
      AND o.status IN ('paid', 'completed')
    LIMIT 1
  )
`;

export const getProductReviews = async (req, res) => {
  const productId = Number(req.params.id ?? req.params.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: 'Invalid product ID.' });
  }

  try {
    await ensureReviewSchema();

    const result = await pool.query(
      `
        SELECT
          r.id,
          r.user_id,
          r.product_id,
          r.rating,
          r.comment,
          r.created_at,
          r.updated_at,
          r.review_status,
          r.moderation_note,
          u.name AS user_name,
          u.avatar AS user_avatar,
          ${getVerifiedPurchaseExpression} AS verified_purchase
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        WHERE r.product_id = $1
          AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN '${REVIEW_STATUS.APPROVED}' ELSE '${REVIEW_STATUS.PENDING}' END) = '${REVIEW_STATUS.APPROVED}'
        ORDER BY r.created_at DESC
      `,
      [productId],
    );

    res.json(result.rows.map(mapReviewRow));
  } catch (error) {
    console.error('Get product reviews error:', error);
    res.status(500).json({ message: 'Failed to load reviews.' });
  }
};

export const createReview = async (req, res) => {
  const productId = Number(req.body.product_id ?? req.body.productId);
  const rating = Number(req.body.rating);
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
  const fieldErrors = {};

  if (!Number.isInteger(productId) || productId <= 0) {
    fieldErrors.product = 'Invalid product.';
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fieldErrors.rating = 'Please select a rating from 1 to 5.';
  }

  if (!comment) {
    fieldErrors.comment = 'Please enter a review comment.';
  } else if (comment.length < 5) {
    fieldErrors.comment = 'Review comment must be at least 5 characters.';
  } else if (comment.length > 1000) {
    fieldErrors.comment = 'Review comment must be 1000 characters or fewer.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json({
      message: 'Please correct the highlighted review fields.',
      fieldErrors,
    });
  }

  try {
    await ensureReviewSchema();

    const productResult = await pool.query(
      'SELECT id FROM products WHERE id = $1 LIMIT 1',
      [productId],
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    const existingReviewResult = await pool.query(
      'SELECT id FROM reviews WHERE user_id = $1 AND product_id = $2 LIMIT 1',
      [req.user.id, productId],
    );

    let review;
    if (existingReviewResult.rows.length > 0) {
      const updated = await pool.query(
        `
          UPDATE reviews
          SET rating = $1,
              comment = $2,
              review_status = $3,
              is_approved = false,
              moderated_by = NULL,
              moderated_at = NULL,
              moderation_note = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
          RETURNING *
        `,
        [rating, comment, REVIEW_STATUS.PENDING, existingReviewResult.rows[0].id],
      );
      review = updated.rows[0];
    } else {
      const inserted = await pool.query(
        `
          INSERT INTO reviews (
            user_id,
            product_id,
            rating,
            comment,
            is_approved,
            review_status,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, false, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING *
        `,
        [req.user.id, productId, rating, comment, REVIEW_STATUS.PENDING],
      );
      review = inserted.rows[0];
    }

    await syncProductRating(productId);

    res.status(201).json({
      message: 'Review submitted and is pending moderation.',
      review: mapReviewRow({
        ...review,
        user_name: req.user.name || 'You',
        user_avatar: req.user.avatar || null,
        verified_purchase: false,
      }),
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({ message: 'Failed to submit review.' });
  }
};

export const getModerationReviews = async (req, res) => {
  const requestedStatus = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'pending';
  const statusFilter = ['all', REVIEW_STATUS.PENDING, REVIEW_STATUS.APPROVED, REVIEW_STATUS.REJECTED].includes(requestedStatus)
    ? requestedStatus
    : REVIEW_STATUS.PENDING;

  try {
    await ensureReviewSchema();

    const params = [];
    const whereClauses = [];
    if (statusFilter !== 'all') {
      params.push(statusFilter);
      whereClauses.push(`COALESCE(r.review_status, CASE WHEN r.is_approved THEN '${REVIEW_STATUS.APPROVED}' ELSE '${REVIEW_STATUS.PENDING}' END) = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.user_id,
          r.product_id,
          r.rating,
          r.comment,
          r.created_at,
          r.updated_at,
          r.review_status,
          r.moderation_note,
          r.moderated_at,
          r.moderated_by,
          u.name AS user_name,
          u.avatar AS user_avatar,
          p.name AS product_name,
          p.image AS product_image,
          moderator.name AS moderated_by_name,
          ${getVerifiedPurchaseExpression} AS verified_purchase
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        JOIN products p ON p.id = r.product_id
        LEFT JOIN users moderator ON moderator.id = r.moderated_by
        ${whereSql}
        ORDER BY
          CASE COALESCE(r.review_status, CASE WHEN r.is_approved THEN '${REVIEW_STATUS.APPROVED}' ELSE '${REVIEW_STATUS.PENDING}' END)
            WHEN '${REVIEW_STATUS.PENDING}' THEN 0
            WHEN '${REVIEW_STATUS.REJECTED}' THEN 1
            ELSE 2
          END,
          r.created_at DESC
      `,
      params,
    );

    res.json(result.rows.map(mapReviewRow));
  } catch (error) {
    console.error('Get moderation reviews error:', error);
    res.status(500).json({ message: 'Failed to load review moderation queue.' });
  }
};

export const moderateReview = async (req, res) => {
  const reviewId = Number(req.params.id);
  const status = typeof req.body.status === 'string' ? req.body.status.trim().toLowerCase() : '';
  const moderationNote = typeof req.body.note === 'string' ? req.body.note.trim() : '';

  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    return res.status(400).json({ message: 'Invalid review ID.' });
  }

  if (![REVIEW_STATUS.APPROVED, REVIEW_STATUS.REJECTED].includes(status)) {
    return res.status(400).json({ message: 'Invalid moderation status.' });
  }

  if (moderationNote.length > 500) {
    return res.status(400).json({ message: 'Moderation note must be 500 characters or fewer.' });
  }

  try {
    await ensureReviewSchema();

    const result = await pool.query(
      `
        UPDATE reviews
        SET review_status = $1,
            is_approved = $2,
            moderated_by = $3,
            moderated_at = CURRENT_TIMESTAMP,
            moderation_note = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `,
      [status, status === REVIEW_STATUS.APPROVED, req.user.id, moderationNote || null, reviewId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    await syncProductRating(result.rows[0].product_id);

    res.json({
      message: status === REVIEW_STATUS.APPROVED ? 'Review approved.' : 'Review rejected.',
      review: mapReviewRow(result.rows[0]),
    });
  } catch (error) {
    console.error('Moderate review error:', error);
    res.status(500).json({ message: 'Failed to update review status.' });
  }
};

ensureReviewSchema().catch((error) => {
  console.error('Failed to ensure review schema:', error);
});
