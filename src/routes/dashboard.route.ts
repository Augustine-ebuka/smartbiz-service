import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import DashboardController from '../controllers/dashboardController';
import {resolveBusinessOwner} from '../middlewares/businessOwnerMiddleware';

const router = Router();

// GET /api/dashboard
router.get('/', authenticateToken, resolveBusinessOwner, DashboardController.getDashboard);

export default router;