import express from 'express';
import {
  createTicket,
  getUserTickets,
  getAllTickets,
  getTicketById,
  updateTicketStatus,
  deleteTicket
} from '../controllers/supportController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Public/Customer routes
router.post('/', createTicket); // Allow both authenticated and guest submissions

// Customer routes (authenticated)
router.get('/my-tickets', authenticateToken, getUserTickets);

// Admin routes
router.get('/', authenticateToken, requireRole('admin'), getAllTickets);
router.get('/:id', authenticateToken, getTicketById);
router.put('/:id/status', authenticateToken, requireRole('admin'), updateTicketStatus);
router.delete('/:id', authenticateToken, requireRole('admin'), deleteTicket);

export default router;
