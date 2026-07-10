import { Router } from 'express';
import AuthController from '../controllers/authController';
import { authenticateToken } from '../middlewares/authMiddleware';
import ExpenseController from '../controllers/expenseController';
import IncomeController from '../controllers/incomeController';
import {resolveBusinessOwner} from '../middlewares/businessOwnerMiddleware';

const router = Router();

// All transaction routes require authentication
router.use(authenticateToken, resolveBusinessOwner);

// ─── Expenses ─────────────────────────────────────────────────────────────────
// POST   /api/transactions/expenses              → log new expense
// GET    /api/transactions/expenses              → list expenses (with optional filters)
// GET    /api/transactions/expenses/summary      → totals & breakdown by category
// GET    /api/transactions/expenses/:id          → get single expense
// PATCH  /api/transactions/expenses/:id          → update expense
// DELETE /api/transactions/expenses/:id          → delete expense

router.post  ('/expenses',          ExpenseController.create);
router.get   ('/expenses',          ExpenseController.getAll);
router.get   ('/expenses/summary',  ExpenseController.getSummary);   // must be before /:id
router.get   ('/expenses/:id',      ExpenseController.getById);
router.patch ('/expenses/:id',      ExpenseController.update);
router.delete('/expenses/:id',      ExpenseController.delete);

// ─── Income ───────────────────────────────────────────────────────────────────
// POST   /api/transactions/income                → log new income
// GET    /api/transactions/income                → list income (with optional filters)
// GET    /api/transactions/income/summary        → totals & breakdown by method/product
// GET    /api/transactions/income/:id            → get single income record
// PATCH  /api/transactions/income/:id            → update income record
// DELETE /api/transactions/income/:id            → delete income record

router.post  ('/income',            IncomeController.create);
router.get   ('/income',            IncomeController.getAll);
router.get   ('/income/summary',    IncomeController.getSummary);    // must be before /:id
router.get   ('/income/:id',        IncomeController.getById);
router.patch ('/income/:id',        IncomeController.update);
router.delete('/income/:id',        IncomeController.delete);

export default router;