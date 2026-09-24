import { Router } from 'express';
import InvestorReportShareController from '../controllers/investorReportShareController';
import { publicShareLimiter } from '../middlewares/rateLimiter';

const router = Router();

// Public, unauthenticated — the page a recipient (e.g. a prospective investor)
// lands on when they open a shared report link.
// GET /api/investor-reports/:token
router.get('/:token', publicShareLimiter, InvestorReportShareController.view);

export default router;
