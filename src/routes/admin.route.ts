import { Router } from 'express';
import { authorizationMiddleware } from '../middlewares/authorizationMiddleware';
import AdminController from '../controllers/adminController';

const router = Router();

// Every route here is platform-admin only. authorizationMiddleware does its
// own token verification + role check, so no separate authenticateToken needed.
router.use(authorizationMiddleware(['admin']));

// GET   /api/admin/users                           → list all users (search/filter/paginate)
// GET   /api/admin/users/:id                        → user detail + subscription info
// POST  /api/admin/users/:id/subscription/activate  → grant a plan with no payment
// POST  /api/admin/users/:id/subscription/revoke    → immediately move a user to free
// PATCH /api/admin/users/:id/subscription           → direct field-level edit
// POST  /api/admin/users/:id/wallet/credit          → manually credit a wallet

router.get   ('/users',                              AdminController.getAllUsers);
router.get   ('/users/:id',                           AdminController.getUserById);
router.post  ('/users/:id/subscription/activate',     AdminController.activateSubscription);
router.post  ('/users/:id/subscription/revoke',       AdminController.revokeSubscription);
router.patch ('/users/:id/subscription',              AdminController.editSubscription);
router.post  ('/users/:id/wallet/credit',             AdminController.creditWallet);

export default router;
