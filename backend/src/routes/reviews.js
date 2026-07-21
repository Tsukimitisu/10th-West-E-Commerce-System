import express from 'express';
import { authenticateToken, authenticateTokenOrSupabaseToken, requirePermission, requireRole } from '../middleware/auth.js';
import { createReview, getModerationReviews, moderateReview, uploadReviewMedia } from '../controllers/reviewController.js';

const router = express.Router();

router.post(
	'/upload-media',
	authenticateTokenOrSupabaseToken,
	express.raw({ type: ['image/*', 'video/*'], limit: '25mb' }),
	uploadReviewMedia,
);
router.post('/', authenticateToken, createReview);
router.get(
  '/moderation',
  authenticateToken,
  requireRole('owner', 'admin', 'super_admin', 'store_staff'),
  requirePermission('reviews.moderate'),
  getModerationReviews,
);
router.patch(
  '/:id/moderate',
  authenticateToken,
  requireRole('owner', 'admin', 'super_admin', 'store_staff'),
  requirePermission('reviews.moderate'),
  moderateReview,
);

export default router;
