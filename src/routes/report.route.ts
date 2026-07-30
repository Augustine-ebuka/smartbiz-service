import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import ReportsController from '../controllers/reportController';
import { authorizationMiddleware } from '../middlewares/authorizationMiddleware';
import {resolveBusinessOwner} from '../middlewares/businessOwnerMiddleware';
import { checkSubscription } from '../middlewares/subscriptionMiddleware';
const router = Router();

// GET /api/reports?range=this-month
// GET /api/reports?range=last-month
// GET /api/reports?range=this-year
// GET /api/reports?range=custom&startDate=2026-01-01&endDate=2026-03-31

router.get('/', authenticateToken, resolveBusinessOwner, checkSubscription('full_reports'), ReportsController.getReports);

export default router;