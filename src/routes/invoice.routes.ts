import { Router } from 'express';
import InvoiceController from '../controllers/invoice.controller';

import { authenticateToken } from '../middlewares/authMiddleware';
import {resolveBusinessOwner} from '../middlewares/businessOwnerMiddleware';
import { checkSubscription } from '../middlewares/subscriptionMiddleware';

const router = Router();

router.use(authenticateToken, resolveBusinessOwner);

// GET    /api/v1/invoices/summary                → totals by status + outstanding amounts
// GET    /api/v1/invoices                        → list all invoices (paginated + filtered)
// POST   /api/v1/invoices                        → create invoice (draft or sent)
// GET    /api/v1/invoices/:id                    → get single invoice with full line items
// PATCH  /api/v1/invoices/:id                    → update invoice
// PATCH  /api/v1/invoices/:id/mark-paid         → mark as paid
// PATCH  /api/v1/invoices/:id/mark-sent         → mark draft as sent
// PATCH  /api/v1/invoices/:id/cancel            → cancel invoice
// DELETE /api/v1/invoices/:id                    → delete invoice

// subscriptionMiddleware('invoice'), InvoiceController.create);
router.get   ('/summary',          InvoiceController.getSummary);
router.get   ('/',                  InvoiceController.getAll);
router.post  ('/',                  InvoiceController.create);
router.get   ('/:id',              InvoiceController.getById);
router.patch ('/:id',              InvoiceController.update);
router.patch ('/:id/mark-paid',    InvoiceController.markAsPaid);
router.patch ('/:id/mark-sent',    InvoiceController.markAsSent);
router.patch ('/:id/cancel',       InvoiceController.cancel);
router.delete('/:id',              InvoiceController.delete);

export default router;
