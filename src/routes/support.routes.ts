import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import SupportController from '../controllers/support.controller';
import { authorizationMiddleware } from '../middlewares/authorizationMiddleware';
const router  = Router();

// ── User routes (any authenticated user) ──────────────────────────────────────

router.use(authenticateToken);

// POST   /api/support                     → create ticket
// GET    /api/support                     → get my tickets
// GET    /api/support/:id                 → get my ticket by id (with full thread)
// POST   /api/support/:id/reply          → user replies to their own ticket

router.post('/',             SupportController.createTicket);
router.get ('/',             SupportController.getUserTickets);
router.get ('/:id',          SupportController.getUserTicketById);
router.post('/:id/reply',    SupportController.userReply);

// ── Admin routes ───────────────────────────────────────────────────────────────

// GET    /api/support/admin/all                    → all tickets with filters
// GET    /api/support/admin/stats                  → dashboard stats
// GET    /api/support/admin/:id                    → any ticket with full thread
// POST   /api/support/admin/:id/reply              → admin replies
// PATCH  /api/support/admin/:id/status             → update status
// PATCH  /api/support/admin/:id/priority           → update priority
// PATCH  /api/support/admin/:id/assign             → assign to admin
// POST   /api/support/admin/bulk-status            → bulk update status

router.use(authorizationMiddleware(['admin']));
router.get  ('/admin/all',              SupportController.getAllTickets);
router.get  ('/admin/stats',            SupportController.getStats);
router.get  ('/admin/:id',              SupportController.getTicketById);
router.post ('/admin/:id/reply',        SupportController.adminReply);
router.patch('/admin/:id/status',       SupportController.updateStatus);
router.patch('/admin/:id/priority',     SupportController.updatePriority);
router.patch('/admin/:id/assign',       SupportController.assignTicket);
router.post ('/admin/bulk-status',      SupportController.bulkUpdateStatus);

export default router;
