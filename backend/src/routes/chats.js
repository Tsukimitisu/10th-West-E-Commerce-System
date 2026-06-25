import express from 'express';
import {
  getConversationMessages,
  getMyConversations,
  markConversationRead,
  sendConversationMessage,
  startProductConversation,
} from '../controllers/productChatController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/product/start', startProductConversation);
router.get('/my-conversations', getMyConversations);
router.get('/:conversationId/messages', getConversationMessages);
router.post('/:conversationId/messages', sendConversationMessage);
router.patch('/:conversationId/read', markConversationRead);

export default router;
