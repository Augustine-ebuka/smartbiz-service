import express from 'express';
import TransactionController from '../controllers/transactionController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { verifyPaystackWebhook } from '../middlewares/paystackWebhook.middleware';

const router = express.Router();

// ✅ Webhook — public but signature-verified, needs raw body
router.post(
    '/paystack-webhook',
    express.json(), // ensure body is parsed before signature check
    verifyPaystackWebhook,
    TransactionController.paystackWebhook
);
// Get all user transactions
router.get('/my-transactions', authenticateToken, TransactionController.getUserTransactions);

// Get transaction by reference
router.get('/:trans_ref', authenticateToken, TransactionController.getTransactionByRef);

// Get all transactions (could be for admin, using authenticateToken for now)
router.get('/', authenticateToken, TransactionController.getAllTransactions);

// Manually create a transaction (if needed)
router.post('/', authenticateToken, TransactionController.createTransaction);

export default router;
