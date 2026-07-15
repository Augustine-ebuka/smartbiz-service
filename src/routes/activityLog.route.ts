import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import {resolveBusinessOwner, requireOwner} from '../middlewares/businessOwnerMiddleware';
import ActivityLogController from '../controllers/activityLogController';

const router = Router();

// Only the owner can view activity logs
router.use(authenticateToken, resolveBusinessOwner, requireOwner);

// GET /api/activity?actorId=&action=&startDate=&endDate=&page=&limit=
router.get('/',                  ActivityLogController.getAll);

// GET /api/activity/actor/:actorId
router.get('/actor/:actorId',    ActivityLogController.getByActor);

export default router;