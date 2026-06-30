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
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/quick-replies', getQuickReplies);
router.post('/quick-replies', saveQuickReply);
router.get('/threads', getThreads);
router.post('/threads', createThread);
router.get('/threads/:id', getThread);
router.post('/threads/:id/messages', sendMessage);
router.put('/threads/:id/read', markThreadRead);
router.put('/threads/:id/assign', assignThread);

export default router;
