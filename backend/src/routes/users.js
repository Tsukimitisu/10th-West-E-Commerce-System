import express from 'express';
import { getProfile, updateProfile, uploadProfileAvatar, changePassword } from '../controllers/userController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get user profile
router.get('/profile', getProfile);

// Update user profile
router.put('/profile', updateProfile);

// Upload profile picture
router.post(
  '/profile/avatar',
  express.raw({ type: 'image/*', limit: '2mb' }),
  uploadProfileAvatar
);

// Change password
router.put('/password', changePassword);

export default router;
