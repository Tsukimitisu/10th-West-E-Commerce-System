import express from 'express';
import {
  getPolicyByType,
  getAllPolicies,
  upsertPolicy,
  deletePolicy
} from '../controllers/policyController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/:type', getPolicyByType);

// Admin routes
router.get('/', authenticateToken, requireRole('admin'), getAllPolicies);
router.put('/:type', authenticateToken, requireRole('admin'), upsertPolicy);
router.delete('/:type', authenticateToken, requireRole('admin'), deletePolicy);

export default router;
