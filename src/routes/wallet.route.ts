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
  getTransactionStatusHandler,
  getMonnifyTransactionHandler,
  redeemTransactionHandler,
  getRedemptionHandler,
  unredeemTransactionHandler,
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

// Public — lets the checkout callback page confirm whether Monnify's webhook
// has actually landed and income was recorded, instead of assuming success
// from the redirect alone.
router.get('/transactions/status/:reference', getTransactionStatusHandler);

// Authenticated — full live transaction detail straight from Monnify,
// scoped to the caller's own business.
router.get(
  '/transactions/monnify/:transactionReference',
  authenticateToken,
  resolveBusinessOwner,
  getMonnifyTransactionHandler,
);

// Authenticated — mark a paid transaction as redeemed/picked up. Owner or
// invited saleskeeper of the transaction's business only.
router.post(
  '/transactions/:reference/redeem',
  authenticateToken,
  resolveBusinessOwner,
  redeemTransactionHandler,
);

// Authenticated — cheap check for whether a payment has been redeemed yet.
router.get(
  '/transactions/:reference/redemption',
  authenticateToken,
  resolveBusinessOwner,
  getRedemptionHandler,
);

// Authenticated, owner-only — undo an accidental redemption mark.
router.delete(
  '/transactions/:reference/redeem',
  authenticateToken,
  resolveBusinessOwner,
  requireOwner,
  unredeemTransactionHandler,
);

// POST /sub-accounts
router.post('/sub-accounts', authenticateToken, resolveBusinessOwner, requireOwner, createSubAccountHandler);
// GET /sub-accounts
router.get('/sub-accounts', authenticateToken, resolveBusinessOwner, requireOwner, fetchSubAccountsHandler);
// GET /banks-list
router.get('/banks-list', fetchBanksListHandler);
// PUT /sub-accounts/:subAccountCode
router.put('/sub-accounts/:subAccountCode', authenticateToken, resolveBusinessOwner, requireOwner, updateSubAccountHandler);

// DELETE /sub-accounts/:subAccountCode
router.delete('/sub-accounts/:subAccountCode', authenticateToken, resolveBusinessOwner, requireOwner, deleteSubAccountHandler);


export default router;