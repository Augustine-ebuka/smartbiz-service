import { Router } from 'express';
import InvoiceController from '../controllers/invoice.controller';
import ClaimController from '../controllers/claim.controller';

import { authenticateToken } from '../middlewares/authMiddleware';
import {resolveBusinessOwner} from '../middlewares/businessOwnerMiddleware';
import { checkSubscription } from '../middlewares/subscriptionMiddleware';

const router = Router();

// Protect invoice management routes — token generation uses authenticated owner flow
router.use(authenticateToken, resolveBusinessOwner);

// GET    /api/v1/invoices/summary                → totals by status + outstanding amounts
// GET    /api/v1/invoices                        → list all invoices (paginated + filtered)
// POST   /api/v1/invoices                        → create invoice (draft or sent)
// GET    /api/v1/invoices/:id                    → get single invoice with full line items
// PATCH  /api/v1/invoices/:id                    → update invoice
// PATCH  /api/v1/invoices/:id/mark-paid         → mark as paid
// PATCH  /api/v1/invoices/:id/mark-sent         → mark draft as sent
// POST   /api/v1/invoices/:id/send-email        → email the invoice to customerEmail
// GET    /api/v1/invoices/:id/pdf                → download the invoice as a PDF
// PATCH  /api/v1/invoices/:id/cancel            → cancel invoice
// DELETE /api/v1/invoices/:id                    → delete invoice

router.get   ('/summary',          InvoiceController.getSummary);
router.get   ('/',                  InvoiceController.getAll);
router.post  ('/', checkSubscription('invoices'), InvoiceController.create);
router.post  ('/:id/claim-token', ClaimController.generateToken);
router.get   ('/:id',              InvoiceController.getById);
router.patch ('/:id',              InvoiceController.update);
router.patch ('/:id/mark-paid',    InvoiceController.markAsPaid);
router.patch ('/:id/mark-sent',    InvoiceController.markAsSent);
router.post  ('/:id/send-email',   InvoiceController.sendEmail);
router.get   ('/:id/pdf',          InvoiceController.downloadPdf);
router.patch ('/:id/cancel',       InvoiceController.cancel);
router.delete('/:id',              InvoiceController.delete);

export default router;
