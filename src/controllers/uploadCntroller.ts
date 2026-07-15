import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';

class UploadController {

  /**
   * POST /api/upload/logo
   * Multipart form — field: "logo"
   * Saves the Cloudinary URL to settings.companyProfile.logoUrl
   */
  async uploadLogo(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded.' });
        return;
      }

      const userId  = req.userId as string;
      const logoUrl = (req.file as any).path;   // Cloudinary returns the URL in req.file.path

      await User.findByIdAndUpdate(userId, {
        $set: { 'settings.companyProfile.logoUrl': logoUrl },
      });

      res.status(200).json({
        success: true,
        message: 'Logo uploaded successfully.',
        data: { logoUrl },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/upload/receipt
   * Multipart form — field: "receipt"
   * Just returns the URL — expense controller saves it to the expense doc
   */
  async uploadFile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded.' });
        return;
      }

      const receiptUrl = (req.file as any).path;

      res.status(200).json({
        success: true,
        message: 'Asset uploaded successfully.',
        data: { receiptUrl },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/upload/avatar
   * Multipart form — field: "avatar"
   * Saves the Cloudinary URL to user.avatarUrl
   */
  async uploadAvatar(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded.' });
        return;
      }

      const userId    = req.userId as string;
      const avatarUrl = (req.file as any).path;

      await User.findByIdAndUpdate(userId, {
        $set: { avatarUrl },
      });

      res.status(200).json({
        success: true,
        message: 'Avatar uploaded successfully.',
        data: { avatarUrl },
      });
    } catch (error) {
      next(error);
    }
  }
  

}

export default new UploadController();