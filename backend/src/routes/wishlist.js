import express from 'express';
import { getWishlist, addToWishlist, removeFromWishlist } from '../controllers/wishlistController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getWishlist);
router.post('/', addToWishlist);
router.delete('/:productId', removeFromWishlist);

export default router;