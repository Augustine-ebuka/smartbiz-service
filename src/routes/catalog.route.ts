import { Router } from 'express';
import AuthController from '../controllers/authController';
import { authenticateToken } from '../middlewares/authMiddleware';
import CustomerController from '../controllers/customerController';
import ProductController from '../controllers/productController';
import ExpenseCategoryController from '../controllers/expenseCategoryController';
import {resolveBusinessOwner} from '../middlewares/businessOwnerMiddleware';
const router = Router();

// All catalog routes require authentication
router.use(authenticateToken);

// ─── Customers ────────────────────────────────────────────────────────────────
// POST   /api/catalog/customers         → create customer
// GET    /api/catalog/customers         → list all customers
// GET    /api/catalog/customers/:id     → get single customer
// PATCH  /api/catalog/customers/:id     → update customer
// DELETE /api/catalog/customers/:id     → delete customer

router.use(resolveBusinessOwner);
router.post  ('/customers',     CustomerController.create);
router.get   ('/customers',     CustomerController.getAll);
router.get   ('/customers/:id', CustomerController.getById);
router.patch ('/customers/:id', CustomerController.update);
router.delete('/customers/:id', CustomerController.delete);

// ─── Products & Services ──────────────────────────────────────────────────────
// POST   /api/catalog/products          → create product/service
// GET    /api/catalog/products          → list all products/services
// GET    /api/catalog/products/:id      → get single product/service
// PATCH  /api/catalog/products/:id      → update product/service
// DELETE /api/catalog/products/:id      → delete product/service

router.post  ('/products',     ProductController.create);
router.get   ('/products',     ProductController.getAll);
router.get   ('/products/:id', ProductController.getById);
router.patch ('/products/:id', ProductController.update);
router.delete('/products/:id', ProductController.delete);

// ─── Expense Categories ───────────────────────────────────────────────────────
// POST   /api/catalog/expense-categories         → create category
// GET    /api/catalog/expense-categories         → list all categories
// GET    /api/catalog/expense-categories/:id     → get single category
// PATCH  /api/catalog/expense-categories/:id     → update category
// DELETE /api/catalog/expense-categories/:id     → delete category

router.post  ('/expense-categories',     ExpenseCategoryController.create);
router.get   ('/expense-categories',     ExpenseCategoryController.getAll);
router.get   ('/expense-categories/:id', ExpenseCategoryController.getById);
router.patch ('/expense-categories/:id', ExpenseCategoryController.update);
router.delete('/expense-categories/:id', ExpenseCategoryController.delete);

export default router;