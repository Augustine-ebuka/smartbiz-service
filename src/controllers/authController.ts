import { Request, Response, NextFunction } from 'express';
import AuthService from '../services/authService';

class AuthController {

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.register(req.body);
      res.status(201).json({
        success: true,
        message: result.message,
        data: {
          user: result.user,
          token: result.token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      const { code } = req.body;

      if (!code) {
        res.status(400).json({ success: false, message: 'OTP is required.' });
        return;
      }

      const result = await AuthService.verifyEmail(userId, code);
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async resendOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      const result = await AuthService.resendOtp(userId);
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login({ email, password });
      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          user: result.user,
          token: result.token,
          requiresEmailVerification: result.requiresEmailVerification,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      const user = await AuthService.getProfile(userId);
      res.status(200).json({
        success: true,
        message: 'Profile fetched successfully.',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      const user = await AuthService.updateProfile(userId, req.body);
      res.status(200).json({
        success: true,
        message: 'Profile updated successfully.',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      const user = await AuthService.updateSettings(userId, req.body);
      res.status(200).json({
        success: true,
        message: 'Settings updated successfully.',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ success: false, message: 'currentPassword and newPassword are required.' });
        return;
      }

      const result = await AuthService.changePassword(userId, currentPassword, newPassword);
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  
  /**
   * POST /api/auth/forgot-password
   * Body: { email }
   * Public — no auth required
   */
  async requestReset(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
 
      if (!email) {
        res.status(400).json({ success: false, message: 'Email is required.' });
        return;
      }
 
      const result = await AuthService.requestReset(email);
      res.status(200).json({ success: true, message: result.message });
    } catch (error) {
      next(error);
    }
  }
 
  /**
   * POST /api/auth/reset-password
   * Body: { email, otp, newPassword }
   * Public — no auth required
   */
  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, code, newPassword } = req.body;
 
      if (!email || !code || !newPassword) {
        res.status(400).json({
          success: false,
          message: 'email, code, and newPassword are all required.',
        });
        return;
      }
 
      if (newPassword.length < 6) {
        res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters.',
        });
        return;
      }
 
      const result = await AuthService.resetPassword(email, code, newPassword);
      res.status(200).json({ success: true, message: result.message });
    } catch (error) {
      next(error);
    }
  }
 
  /**
   * POST /api/auth/resend-reset-otp
   * Body: { email }
   * Public — no auth required
   */
  async resendResetOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
 
      if (!email) {
        res.status(400).json({ success: false, message: 'Email is required.' });
        return;
      }
 
      const result = await AuthService.resendResetOtp(email);
      res.status(200).json({ success: true, message: result.message });
    } catch (error) {
      next(error);
    }
  }

}

export default new AuthController();
