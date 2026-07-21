import express from 'express';
import {
  assignThread,
  createThread,
  getQuickReplies,
  getThread,
  getThreads,
  markThreadRead,
  saveQuickReply,
  sendMessage,
} from '../controllers/chatController.js';
import { authenticateToken, requirePermissionForRoles } from '../middleware/auth.js';
import { STAFF_ROLES } from '../constants/schemaEnums.js';

const router = express.Router();

router.use(authenticateToken);

const staffPermission = (permission) => requirePermissionForRoles(permission, ...STAFF_ROLES);

router.get('/quick-replies', staffPermission('chat.view'), getQuickReplies);
router.post('/quick-replies', staffPermission('chat.reply'), saveQuickReply);
router.get('/threads', staffPermission('chat.view'), getThreads);
router.post('/threads', staffPermission('chat.reply'), createThread);
router.get('/threads/:id', staffPermission('chat.view'), getThread);
router.post('/threads/:id/messages', staffPermission('chat.reply'), sendMessage);
router.put('/threads/:id/read', staffPermission('chat.reply'), markThreadRead);
router.put('/threads/:id/assign', staffPermission('chat.reply'), assignThread);

export default router;
