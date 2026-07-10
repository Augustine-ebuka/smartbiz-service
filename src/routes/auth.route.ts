import express from 'express';
import AuthController from '../controllers/authController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = express.Router();

router.post('/register', AuthController.register);
router.post('/verify-email', authenticateToken, AuthController.verifyEmail);
router.post('/login', AuthController.login);
router.get('/profile', authenticateToken, AuthController.getProfile);
router.patch('/profile', authenticateToken, AuthController.updateProfile);
router.patch('/settings', authenticateToken, AuthController.updateSettings);
router.patch('/change-password', authenticateToken, AuthController.changePassword);

// Password reset flow (no auth token needed — user is locked out)
router.post('/forgot-password',    AuthController.requestReset);
router.post('/reset-password',     AuthController.resetPassword);
router.post('/resend-reset-otp',   AuthController.resendResetOtp);


export default router;  