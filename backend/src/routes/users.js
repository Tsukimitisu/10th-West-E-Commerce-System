import express from 'express';
import { body } from 'express-validator';
import { getProfile, updateProfile, uploadProfileAvatar, changePassword, confirmEmailChange } from '../controllers/userController.js';
import { authenticateTokenOrSupabaseToken } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';

const router = express.Router();

router.post(
  '/profile/email-change/confirm',
  body('token')
    .trim()
    .notEmpty().withMessage('Email change token is required')
    .isLength({ min: 64, max: 64 }).withMessage('Invalid email change token format')
    .matches(/^[a-f0-9]+$/i).withMessage('Invalid email change token format'),
  validate,
  confirmEmailChange
);

// All routes require authentication
router.use(authenticateTokenOrSupabaseToken);

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
