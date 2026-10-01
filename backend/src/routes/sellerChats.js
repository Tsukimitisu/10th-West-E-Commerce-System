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
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('owner', 'store_staff', 'admin', 'super_admin'));

router.get('/', requirePermission('chat.view'), getSellerConversations);
router.get('/search', requirePermission('chat.view'), getSellerConversations);
router.get('/unread-count', requirePermission('chat.view'), getSellerUnreadCount);
router.get('/:conversationId', requirePermission('chat.view'), getConversationMessages);
router.get('/:conversationId/messages', requirePermission('chat.view'), getConversationMessages);
router.post('/:conversationId/messages', requirePermission('chat.reply'), sendConversationMessage);
router.patch('/:conversationId/read', requirePermission('chat.reply'), markConversationRead);
router.patch('/:conversationId/archive', requirePermission('chat.reply'), archiveSellerConversation);
router.patch('/:conversationId/pin', requirePermission('chat.reply'), pinSellerConversation);

export default router;
