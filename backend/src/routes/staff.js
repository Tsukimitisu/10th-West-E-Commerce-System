import express from 'express';
import { body } from 'express-validator';
import {
  listStaff, getStaff, addStaff, editStaff,
  toggleStaffStatus, deleteStaff,
  getStaffActivity, updateStaffPermissions,
  getAllPermissions, getStaffPerformance,
} from '../controllers/staffController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';

const router = express.Router();

// All staff routes require admin
router.use(authenticateToken, requireRole('admin'));

// Staff CRUD
router.get('/', listStaff);
router.get('/permissions', getAllPermissions);
router.get('/:id', getStaff);
router.post('/',
  body('name').trim().notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['admin', 'cashier']),
  validate,
  addStaff
);
router.put('/:id',
  body('name').trim().notEmpty(),
  body('email').isEmail(),
  body('role').isIn(['admin', 'cashier']),
  validate,
  editStaff
);
router.patch('/:id/status', toggleStaffStatus);
router.delete('/:id', deleteStaff);

// Staff activity & permissions
router.get('/:id/activity', getStaffActivity);
router.put('/:id/permissions', updateStaffPermissions);
router.get('/:id/performance', getStaffPerformance);

export default router;
