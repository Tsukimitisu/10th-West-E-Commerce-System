import express from 'express';
import {
  getConversationMessages,
  getMyConversations,
  markConversationRead,
  sendConversationMessage,
  startProductConversation,
} from '../controllers/productChatController.js';
import { authenticateToken, requirePermissionForRoles } from '../middleware/auth.js';
import { STAFF_ROLES } from '../constants/schemaEnums.js';

const router = express.Router();

router.use(authenticateToken);

const staffPermission = (permission) => requirePermissionForRoles(permission, ...STAFF_ROLES);

router.post('/product/start', staffPermission('chat.reply'), startProductConversation);
router.get('/my-conversations', staffPermission('chat.view'), getMyConversations);
router.get('/:conversationId/messages', staffPermission('chat.view'), getConversationMessages);
router.post('/:conversationId/messages', staffPermission('chat.reply'), sendConversationMessage);
router.patch('/:conversationId/read', staffPermission('chat.reply'), markConversationRead);

export default router;
