import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { listPublicCarousel, listManagedCarousel, carouselDestinations, publicCarouselPromotion, saveCarousel, deleteCarousel } from '../controllers/carouselController.js';

const router = express.Router();
const managers = [authenticateToken, requireRole('admin', 'super_admin', 'owner')];
router.get('/', listPublicCarousel);
router.get('/destinations/promotion/:id', publicCarouselPromotion);
router.get('/all', ...managers, listManagedCarousel);
router.get('/destinations', ...managers, carouselDestinations);
router.post('/', ...managers, saveCarousel);
router.put('/:id', ...managers, saveCarousel);
router.delete('/:id', ...managers, deleteCarousel);
export default router;
