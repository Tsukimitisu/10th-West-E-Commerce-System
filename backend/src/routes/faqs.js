import express from 'express';
import {
  getFAQs,
  getAllFAQs,
  getFAQById,
  createFAQ,
  updateFAQ,
  deleteFAQ
} from '../controllers/faqController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/', getFAQs);
router.get('/:id', getFAQById);

// Admin routes
router.get('/admin/all', authenticateToken, requireRole('admin'), getAllFAQs);
router.post('/', authenticateToken, requireRole('admin'), createFAQ);
router.put('/:id', authenticateToken, requireRole('admin'), updateFAQ);
router.delete('/:id', authenticateToken, requireRole('admin'), deleteFAQ);

export default router;
