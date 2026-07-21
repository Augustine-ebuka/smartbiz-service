import { Router } from 'express';
import {
  createReservedAccountHandler,
  initializeTransactionHandler,
  verifyBankAccountHandler,
  createSubAccountHandler,
  deleteSubAccountHandler,
  fetchSubAccountsHandler,
  fetchBanksListHandler,
  updateSubAccountHandler,
  handleMonnifyWebhook,
} from '../controllers/walletController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { resolveBusinessOwner, requireOwner } from '../middlewares/businessOwnerMiddleware';
const router = Router();

router.post('/reserved-accounts', createReservedAccountHandler);

// webhook handler
router.post('/webhook', handleMonnifyWebhook);

// e.g. GET /bank-accounts/verify?accountNumber=9035244019&bankCode=100033
router.get('/bank-accounts/verify', verifyBankAccountHandler);

// Returns a checkoutUrl to redirect the user to for payment
router.post('/transactions/initialize', initializeTransactionHandler);

// POST /sub-accounts
router.post('/sub-accounts', authenticateToken, resolveBusinessOwner, requireOwner, createSubAccountHandler);
// GET /sub-accounts
router.get('/sub-accounts', authenticateToken, resolveBusinessOwner, requireOwner, fetchSubAccountsHandler);
// GET /banks-list
router.get('/banks-list', fetchBanksListHandler);
// PUT /sub-accounts/:subAccountCode
router.put('/sub-accounts/:subAccountCode', updateSubAccountHandler);

// DELETE /sub-accounts/:subAccountCode
router.delete('/sub-accounts/:subAccountCode', deleteSubAccountHandler);


export default router;