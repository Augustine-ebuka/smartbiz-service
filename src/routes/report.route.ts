import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import ReportsController from '../controllers/reportController';
import InvestorReportShareController from '../controllers/investorReportShareController';
import { authorizationMiddleware } from '../middlewares/authorizationMiddleware';
import {resolveBusinessOwner, requireOwner} from '../middlewares/businessOwnerMiddleware';
import { checkSubscription } from '../middlewares/subscriptionMiddleware';
const router = Router();

// GET /api/reports?range=this-month
// GET /api/reports?range=last-month
// GET /api/reports?range=this-year
// GET /api/reports?range=custom&startDate=2026-01-01&endDate=2026-03-31

router.get('/', authenticateToken, resolveBusinessOwner, checkSubscription('full_reports'), ReportsController.getReports);

// GET /api/reports/products/:productId?range=this-month
router.get('/products/:productId', authenticateToken, resolveBusinessOwner, checkSubscription('full_reports'), ReportsController.getProductReport);

// Investor report sharing — owner-only. Generates a read-only link (expires in 2 days)
// to the current report snapshot, e.g. to send to a prospective investor.
// POST /api/reports/share  { range, startDate?, endDate?, recipientName?, recipientEmail? }
router.post('/share', authenticateToken, resolveBusinessOwner, requireOwner, checkSubscription('full_reports'), InvestorReportShareController.create);

// GET /api/reports/share — list links this owner has generated
router.get('/share', authenticateToken, resolveBusinessOwner, requireOwner, InvestorReportShareController.list);

// DELETE /api/reports/share/:id — revoke a link before it naturally expires
router.delete('/share/:id', authenticateToken, resolveBusinessOwner, requireOwner, InvestorReportShareController.revoke);

export default router;