import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { resolveBusinessOwner, requireOwner } from '../middlewares/businessOwnerMiddleware';
import SaleskeeperController from '../controllers/saleskeeperController';
import { authorizationMiddleware } from '../middlewares/authorizationMiddleware';
const router = Router();

// All saleskeeper management routes:
// 1. Must be authenticated
// 2. Must resolve the business owner context
// 3. Must be the actual owner (not a saleskeeper themselves)
router.use(authenticateToken, resolveBusinessOwner, requireOwner);

// POST   /api/saleskeepers/invite    → send invite + create account
// GET    /api/saleskeepers           → list all saleskeepers
// PATCH  /api/saleskeepers/:id/revoke     → revoke access
// PATCH  /api/saleskeepers/:id/reinstate  → reinstate access
// DELETE /api/saleskeepers/:id       → remove permanently

router.post  ('/invite', authorizationMiddleware(['admin', 'business_owner']), SaleskeeperController.invite);
router.get   ('/',                   SaleskeeperController.getAll);
router.patch ('/:id/revoke',         authorizationMiddleware(['admin', 'business_owner']), SaleskeeperController.revoke);
router.patch ('/:id/reinstate',      authorizationMiddleware(['admin', 'business_owner']), SaleskeeperController.reinstate);
router.delete('/:id',                authorizationMiddleware(['admin', 'business_owner']), SaleskeeperController.remove);

export default router;