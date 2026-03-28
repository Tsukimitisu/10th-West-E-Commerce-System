import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { createReview, getModerationReviews, moderateReview } from '../controllers/reviewController.js';

const router = express.Router();

router.post('/', authenticateToken, createReview);
router.get('/moderation', authenticateToken, requireRole('owner', 'admin', 'super_admin'), getModerationReviews);
router.patch('/:id/moderate', authenticateToken, requireRole('owner', 'admin', 'super_admin'), moderateReview);

export default router;
