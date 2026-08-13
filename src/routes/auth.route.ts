import express from 'express';
import AuthController from '../controllers/authController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { authLimiter } from '../middlewares/rateLimiter';

const router = express.Router();

router.post('/register', authLimiter, AuthController.register);
router.post('/verify-email', authLimiter, authenticateToken, AuthController.verifyEmail);
router.post('/login', authLimiter, AuthController.login);
router.get('/profile', authenticateToken, AuthController.getProfile);
router.patch('/profile', authenticateToken, AuthController.updateProfile);
router.patch('/settings', authenticateToken, AuthController.updateSettings);
router.patch('/change-password', authenticateToken, AuthController.changePassword);

// Password reset flow (no auth token needed — user is locked out)
router.post('/forgot-password',    authLimiter, AuthController.requestReset);
router.post('/reset-password',     authLimiter, AuthController.resetPassword);
router.post('/resend-reset-otp',   authLimiter, AuthController.resendResetOtp);


export default router;  