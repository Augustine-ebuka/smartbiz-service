import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { resolveBusinessOwner } from '../middlewares/businessOwnerMiddleware';
import TaxController from '../controllers/tax.controller';

const router = Router();

// GET   /api/tax/settings → business's saved tax profile
// PATCH /api/tax/settings → update any subset of it
router.get  ('/settings', authenticateToken, resolveBusinessOwner, TaxController.getSettings);
router.patch('/settings', authenticateToken, resolveBusinessOwner, TaxController.updateSettings);

// Quick PAYE estimate — public, no auth
// GET /api/tax/estimate?grossIncome=5000000
router.get('/estimate', TaxController.estimateManual);

// Full smart estimate — authenticated, pulls from DB
// GET /api/tax/full-estimate?startDate=2026-01-01&endDate=2026-12-31&businessStructure=sole_trader
// GET /api/tax/full-estimate?startDate=2026-01-01&endDate=2026-12-31&businessStructure=registered_company
router.get('/full-estimate', authenticateToken, resolveBusinessOwner, TaxController.fullEstimate);

export default router;
