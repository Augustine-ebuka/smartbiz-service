import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { resolveBusinessOwner } from '../middlewares/businessOwnerMiddleware';
import TaxController from '../controllers/tax.controller';

const router = Router();

// Quick PAYE estimate — public, no auth
// GET /api/tax/estimate?grossIncome=5000000
router.get('/estimate', TaxController.estimateManual);

// Full smart estimate — authenticated, pulls from DB
// GET /api/tax/full-estimate?startDate=2026-01-01&endDate=2026-12-31&businessStructure=sole_trader
// GET /api/tax/full-estimate?startDate=2026-01-01&endDate=2026-12-31&businessStructure=registered_company
router.get('/full-estimate', authenticateToken, resolveBusinessOwner, TaxController.fullEstimate);

export default router;
