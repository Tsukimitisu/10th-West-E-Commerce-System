import pool from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import supabaseClient from '../services/supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reviewUploadsDir = path.join(__dirname, '..', '..', 'uploads', 'reviews');

const REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const REVIEW_MEDIA_BUCKET = 'review-media';
const REVIEW_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
const REVIEW_MEDIA_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogg',
};

let reviewSchemaEnsured = false;
let reviewSchemaPromise = null;

const normalizeReviewStatus = (review) => {
  if (!review) return REVIEW_STATUS.PENDING;
  if (review.review_status) return review.review_status;
  return review.is_approved ? REVIEW_STATUS.APPROVED : REVIEW_STATUS.PENDING;
};

const normalizeReviewMedia = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string' && item.trim()) {
        return {
          url: item.trim(),
          kind: /\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i.test(item) ? 'video' : 'image',
        };
      }

      if (item && typeof item === 'object' && typeof item.url === 'string' && item.url.trim()) {
        const kindHint = String(item.kind || item.type || item.media_type || '').toLowerCase();
        const kind = kindHint === 'video' || kindHint === 'image'
          ? kindHint
          : (/\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i.test(item.url) ? 'video' : 'image');

        return {
          url: item.url.trim(),
          kind,
        };
      }

      return null;
    })
    .filter(Boolean)
    .slice(0, 4);
};

const mapReviewRow = (row) => ({
  ...row,
  rating: Number(row.rating),
  verified_purchase: Boolean(row.verified_purchase),
  review_status: normalizeReviewStatus(row),
  media_urls: normalizeReviewMedia(row.media_urls),
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
      ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT '[]'::jsonb,
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

const hasSupabaseStorageConfig = () => {
  return Boolean(
    process.env.SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY),
  );
};

const ensureReviewMediaBucket = async () => {
  if (!hasSupabaseStorageConfig()) return;

  const { data: bucket, error: getBucketError } = await supabaseClient.storage.getBucket(REVIEW_MEDIA_BUCKET);
  if (!getBucketError && bucket?.id) {
    return;
  }

  const { error: createBucketError } = await supabaseClient.storage.createBucket(REVIEW_MEDIA_BUCKET, {
    public: true,
    fileSizeLimit: `${REVIEW_MEDIA_MAX_BYTES}`,
    allowedMimeTypes: Object.keys(REVIEW_MEDIA_CONTENT_TYPES),
  });

  if (createBucketError && !String(createBucketError.message || '').toLowerCase().includes('already exists')) {
    throw createBucketError;
  }
};

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
          r.media_urls,
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
  const rawMediaUrls = req.body.media_urls ?? req.body.mediaUrls;
  const mediaUrls = normalizeReviewMedia(rawMediaUrls);
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

  if (Array.isArray(rawMediaUrls) && rawMediaUrls.length > 4) {
    fieldErrors.media = 'You can attach up to 4 media files per review.';
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
      'SELECT id, media_urls FROM reviews WHERE user_id = $1 AND product_id = $2 LIMIT 1',
      [req.user.id, productId],
    );

    let review;
    if (existingReviewResult.rows.length > 0) {
      const hasIncomingMedia = Array.isArray(rawMediaUrls);
      const mediaPayload = hasIncomingMedia
        ? mediaUrls
        : normalizeReviewMedia(existingReviewResult.rows[0].media_urls);

      const updated = await pool.query(
        `
          UPDATE reviews
          SET rating = $1,
              comment = $2,
              media_urls = $3,
              review_status = $4,
              is_approved = false,
              moderated_by = NULL,
              moderated_at = NULL,
              moderation_note = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $5
          RETURNING *
        `,
        [rating, comment, JSON.stringify(mediaPayload), REVIEW_STATUS.PENDING, existingReviewResult.rows[0].id],
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
            media_urls,
            is_approved,
            review_status,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, false, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING *
        `,
        [req.user.id, productId, rating, comment, JSON.stringify(mediaUrls), REVIEW_STATUS.PENDING],
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

export const uploadReviewMedia = async (req, res) => {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const extension = REVIEW_MEDIA_CONTENT_TYPES[contentType];

  if (!extension) {
    return res.status(400).json({
      message: 'Unsupported media type. Allowed: JPG, PNG, WEBP, GIF, MP4, WEBM, MOV, OGG.',
    });
  }

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ message: 'Media file is required.' });
  }

  if (req.body.length > REVIEW_MEDIA_MAX_BYTES) {
    return res.status(400).json({ message: 'Media file must be 25 MB or smaller.' });
  }

  const kind = contentType.startsWith('video/') ? 'video' : 'image';
  const productId = Number(req.query.product_id || req.query.productId || 0);
  const filename = `review-${req.user.id}-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}.${extension}`;
  const folder = Number.isInteger(productId) && productId > 0 ? `product-${productId}` : 'general';

  let mediaUrl = null;

  if (hasSupabaseStorageConfig()) {
    try {
      await ensureReviewMediaBucket();

      const objectPath = `user-${req.user.id}/${folder}/${filename}`;
      const { error: uploadError } = await supabaseClient.storage
        .from(REVIEW_MEDIA_BUCKET)
        .upload(objectPath, req.body, {
          contentType,
          upsert: false,
        });

      if (!uploadError) {
        const { data: publicUrlData } = supabaseClient.storage
          .from(REVIEW_MEDIA_BUCKET)
          .getPublicUrl(objectPath);
        mediaUrl = publicUrlData?.publicUrl || null;
      } else {
        console.warn('Supabase review media upload failed, falling back to local FS:', uploadError.message);
      }
    } catch (storageError) {
      console.warn('Supabase review media setup/upload failed, falling back to local FS:', storageError.message || storageError);
    }
  }

  if (!mediaUrl) {
    await fs.mkdir(reviewUploadsDir, { recursive: true });
    const filepath = path.join(reviewUploadsDir, filename);
    await fs.writeFile(filepath, req.body);
    mediaUrl = `${req.protocol}://${req.get('host')}/uploads/reviews/${filename}`;
  }

  return res.status(201).json({
    message: 'Review media uploaded successfully.',
    media: {
      url: mediaUrl,
      kind,
    },
  });
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
          r.media_urls,
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
