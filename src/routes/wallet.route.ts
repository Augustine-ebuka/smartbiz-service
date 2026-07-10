import express from 'express';
import AuthController from '../controllers/authController';
import { authenticateToken } from '../middlewares/authMiddleware';
import WalletController from '../controllers/walletController';

const router = express.Router();

router.post('/create', authenticateToken, WalletController.createWallet);
router.get('/:user_id', authenticateToken, WalletController.getWallet);
router.post('/deposit', authenticateToken, WalletController.deposit);
router.post('/withdraw', authenticateToken, WalletController.withdraw);
router.post('/verify-transaction', authenticateToken, WalletController.verifyTransaction);
router.get('/ledger', authenticateToken, WalletController.getLedger);

export default router;