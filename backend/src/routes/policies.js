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
router.get('/', authenticateToken, requireRole('admin', 'super_admin', 'owner'), getAllPolicies);
router.put('/:type', authenticateToken, requireRole('admin', 'super_admin', 'owner'), upsertPolicy);
router.delete('/:type', authenticateToken, requireRole('admin', 'super_admin', 'owner'), deletePolicy);

export default router;
