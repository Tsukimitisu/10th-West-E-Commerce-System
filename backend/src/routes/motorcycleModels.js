import express from 'express';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import {
  createMotorcycleModel,
  getMotorcycleModels,
  updateMotorcycleModel,
} from '../controllers/motorcycleModelController.js';

const router = express.Router();
const staffRoles = requireRole('admin', 'super_admin', 'owner', 'store_staff');

router.get('/', getMotorcycleModels);
router.get('/manage', authenticateToken, staffRoles, requirePermission('inventory.view'), getMotorcycleModels);
router.post('/', authenticateToken, staffRoles, requirePermission('products.manage'), createMotorcycleModel);
router.put('/:id', authenticateToken, staffRoles, requirePermission('products.manage'), updateMotorcycleModel);

export default router;
