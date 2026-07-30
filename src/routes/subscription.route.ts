import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { resolveBusinessOwner, requireOwner } from '../middlewares/businessOwnerMiddleware';
import SubscriptionController from '../controllers/subscriptionController';

const router = Router();

router.use(authenticateToken, resolveBusinessOwner);

// GET  /api/subscription           → current plan info + usage + available plans (owner or staff)
// POST /api/subscription/upgrade   → initialize payment for plan upgrade (owner only)
// POST /api/subscription/cancel    → cancel subscription (owner only)
//
// Admin actions (activate/revoke/edit any user's subscription, list users)
// live at /v1/admin/users/... — see admin.route.ts.

router.get ('/',        SubscriptionController.getInfo);
router.post('/upgrade', requireOwner, SubscriptionController.upgrade);
router.post('/cancel',  requireOwner, SubscriptionController.cancel);

export default router;