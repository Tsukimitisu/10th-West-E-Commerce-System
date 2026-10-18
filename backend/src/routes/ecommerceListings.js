import express from 'express';
import {
  createEcommerceListing,
  getEcommerceListings,
  getPublicSet,
  listPublicSets,
  updateEcommerceListing,
} from '../controllers/ecommerceListingController.js';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';

const router = express.Router();
const staff = [authenticateToken, requireRole('admin', 'super_admin', 'owner', 'store_staff')];

router.get('/public/sets', listPublicSets);
router.get('/public/sets/:id', getPublicSet);
router.get('/', ...staff, requirePermission('products.view'), getEcommerceListings);
router.post('/', ...staff, requirePermission('products.manage'), createEcommerceListing);
router.put('/:id', ...staff, requirePermission('products.manage'), updateEcommerceListing);

export default router;
