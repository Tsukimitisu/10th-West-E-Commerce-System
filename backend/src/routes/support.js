import express from 'express';
import {
  createTicket,
  getUserTickets,
  getAllTickets,
  getTicketById,
  updateTicketStatus,
  deleteTicket
} from '../controllers/supportController.js';
import { authenticateToken, optionalAuth, requireRole } from '../middleware/auth.js';
import { supportLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public/Customer routes
router.post('/', supportLimiter, optionalAuth, createTicket); // Allow both authenticated and guest submissions

// Customer routes (authenticated)
router.get('/my-tickets', authenticateToken, getUserTickets);

// Admin routes
router.get('/', authenticateToken, requireRole('admin', 'super_admin', 'owner'), getAllTickets);
router.get('/:id', authenticateToken, getTicketById);
router.put('/:id/status', authenticateToken, requireRole('admin', 'super_admin', 'owner'), updateTicketStatus);
router.delete('/:id', authenticateToken, requireRole('admin', 'super_admin', 'owner'), deleteTicket);

export default router;
