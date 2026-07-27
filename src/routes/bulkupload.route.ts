import { Router } from 'express';
import BulkImportController, { uploadExcel } from '../controllers/bulkUploadController';
import { authenticateToken } from '../middlewares/authMiddleware';
import {resolveBusinessOwner} from '../middlewares/businessOwnerMiddleware';
const router = Router();

router.use(authenticateToken, resolveBusinessOwner);

// ── Template downloads ─────────────────────────────────────────────────────────
// GET /api/bulk/template/income    → download income Excel template
// GET /api/bulk/template/expense   → download expense Excel template

router.get('/template/income',   BulkImportController.downloadIncomeTemplate);
router.get('/template/expense',  BulkImportController.downloadExpenseTemplate);
router.get('/template/customers',  BulkImportController.downloadCustomerTemplate);

// ── Bulk imports ───────────────────────────────────────────────────────────────
// POST /api/bulk/import/income     → upload filled income sheet
// POST /api/bulk/import/expense    → upload filled expense sheet

router.post('/import/income',  uploadExcel, BulkImportController.importIncome);
router.post('/import/expense', uploadExcel, BulkImportController.importExpense);
router.post('/import/customers', uploadExcel, BulkImportController.importCustomers);

export default router;