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
router.get('/admin/all', authenticateToken, requireRole('admin', 'super_admin', 'owner'), getAllFAQs);
router.post('/', authenticateToken, requireRole('admin', 'super_admin', 'owner'), createFAQ);
router.put('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), updateFAQ);
router.delete('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), deleteFAQ);

export default router;
