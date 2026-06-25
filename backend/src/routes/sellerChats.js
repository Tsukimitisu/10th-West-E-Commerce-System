import express from 'express';
import {
  archiveSellerConversation,
  getConversationMessages,
  getSellerConversations,
  getSellerUnreadCount,
  markConversationRead,
  pinSellerConversation,
  sendConversationMessage,
} from '../controllers/productChatController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('owner', 'store_staff', 'admin', 'super_admin'));

router.get('/', getSellerConversations);
router.get('/search', getSellerConversations);
router.get('/unread-count', getSellerUnreadCount);
router.get('/:conversationId', getConversationMessages);
router.get('/:conversationId/messages', getConversationMessages);
router.post('/:conversationId/messages', sendConversationMessage);
router.patch('/:conversationId/read', markConversationRead);
router.patch('/:conversationId/archive', archiveSellerConversation);
router.patch('/:conversationId/pin', pinSellerConversation);

export default router;
