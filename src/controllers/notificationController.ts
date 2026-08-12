import { Request, Response, NextFunction } from 'express';
import NotificationService from '../services/notificationService';
import { NotificationType } from '../models/notification.model';

class NotificationController {

  /**
   * GET /api/notifications?unreadOnly=true&type=low_stock&page=1&limit=20
   */
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const userId     = (req as any).businessOwnerId as string;
      const unreadOnly = req.query.unreadOnly === 'true';
      const type       = req.query.type as NotificationType | undefined;
      const page       = parseInt(req.query.page  as string) || 1;
      const limit      = parseInt(req.query.limit as string) || 20;

      const result = await NotificationService.getAll(userId, { unreadOnly, type, page, limit });
      res.status(200).json({ success: true, message: 'Notifications fetched.', data: result });
    } catch (error) { next(error); }
  }

  /**
   * GET /api/notifications/unread-count
   */
  async getUnreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const count  = await NotificationService.getUnreadCount(userId);
      res.status(200).json({ success: true, message: 'Unread count fetched.', data: { count } });
    } catch (error) { next(error); }
  }

  /**
   * PATCH /api/notifications/:id/read
   */
  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const notification = await NotificationService.markAsRead(userId, req.params.id);
      res.status(200).json({ success: true, message: 'Notification marked as read.', data: notification });
    } catch (error) { next(error); }
  }

  /**
   * PATCH /api/notifications/read-all
   */
  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const count  = await NotificationService.markAllAsRead(userId);
      res.status(200).json({ success: true, message: `${count} notification(s) marked as read.`, data: { count } });
    } catch (error) { next(error); }
  }

  /**
   * DELETE /api/notifications/:id
   */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      await NotificationService.delete(userId, req.params.id);
      res.status(200).json({ success: true, message: 'Notification deleted.' });
    } catch (error) { next(error); }
  }

}

export default new NotificationController();
