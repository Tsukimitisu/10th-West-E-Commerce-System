import express from 'express';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { adminMutationLimiter } from '../middleware/rateLimiter.js';
import { getOfflineDevice, getOfflineDevices, getOfflineReserves, registerOfflineDevice, renameOfflineDevice, revokeOfflineDevice, saveOfflineReserve, saveOfflineStockMode, syncOfflineCatalogue, requestOfflineDevice, getCurrentOfflineDeviceRequest, listOfflineDeviceRequests, approveOfflineDeviceRequest, rejectOfflineDeviceRequest } from '../controllers/offlinePosController.js';
import {
  createPosOrder,
  getPosCapabilities,
  getPosDailySummary,
  getPosOrder,
  getPosProducts,
  getPosReceipt,
  listPosOrders,
  validatePosCart,
  voidPosOrder,
} from '../controllers/posController.js';

const router = express.Router();
const allowedRoles = requireRole('admin', 'super_admin', 'owner', 'store_staff', 'cashier');
const canAccessPos = [authenticateToken, allowedRoles, requirePermission('pos.access')];
const manageDevices = [...canAccessPos,requireRole('owner','admin','super_admin')];
router.post('/offline/device-requests', ...canAccessPos, adminMutationLimiter, requestOfflineDevice);
router.get('/offline/device-requests/current', ...canAccessPos, getCurrentOfflineDeviceRequest);
router.get('/offline/device-requests', ...manageDevices, listOfflineDeviceRequests);
router.post('/offline/device-requests/:id/approve', ...manageDevices, adminMutationLimiter, approveOfflineDeviceRequest);
router.post('/offline/device-requests/:id/reject', ...manageDevices, adminMutationLimiter, rejectOfflineDeviceRequest);

router.get('/offline/device', ...canAccessPos, getOfflineDevice);
router.get('/offline/device/:deviceUuid', ...canAccessPos, getOfflineDevice);
router.post('/offline/device', ...canAccessPos, adminMutationLimiter, registerOfflineDevice);
router.delete('/offline/device', ...canAccessPos, requireRole('owner','super_admin','admin'), adminMutationLimiter, revokeOfflineDevice);
router.delete('/offline/device/:id', ...canAccessPos, requireRole('owner','super_admin','admin'), adminMutationLimiter, revokeOfflineDevice);
router.patch('/offline/device/:id', ...canAccessPos, requireRole('owner','super_admin','admin'), adminMutationLimiter, renameOfflineDevice);
const manageReserve=[authenticateToken, requireRole('admin','super_admin','owner','store_staff'),requirePermission('inventory.adjust')];
router.patch('/offline/device/:id/stock-mode', ...manageReserve, adminMutationLimiter, saveOfflineStockMode);
router.get('/offline/devices', ...manageReserve, getOfflineDevices);
router.get('/offline/reserves', ...manageReserve, getOfflineReserves);
router.put('/offline/reserve', ...manageReserve, adminMutationLimiter, saveOfflineReserve);
router.post('/offline/snapshot', ...canAccessPos, adminMutationLimiter, syncOfflineCatalogue);

router.get('/products', ...canAccessPos, getPosProducts);
router.get('/capabilities', ...canAccessPos, getPosCapabilities);
router.post('/validate-cart', ...canAccessPos, validatePosCart);
router.post('/orders', ...canAccessPos, createPosOrder);
router.get('/orders', ...canAccessPos, listPosOrders);
router.get('/orders/:id', ...canAccessPos, getPosOrder);
router.get('/orders/:id/receipt', ...canAccessPos, getPosReceipt);
router.post('/orders/:id/void', ...canAccessPos, requirePermission('pos.void'), voidPosOrder);
router.get('/daily-summary', ...canAccessPos, getPosDailySummary);

export default router;
