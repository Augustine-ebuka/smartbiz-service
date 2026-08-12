import { Router } from 'express';
import NotificationController from '../controllers/notificationController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { resolveBusinessOwner } from '../middlewares/businessOwnerMiddleware';

const router = Router();

router.use(authenticateToken, resolveBusinessOwner);

// GET    /api/notifications                  → list (paginated, filter by unreadOnly/type)
// GET    /api/notifications/unread-count      → badge count
// PATCH  /api/notifications/read-all          → mark all as read (must be before /:id/read)
// PATCH  /api/notifications/:id/read          → mark one as read
// DELETE /api/notifications/:id               → delete one

router.get   ('/unread-count', NotificationController.getUnreadCount);
router.get   ('/',             NotificationController.getAll);
router.patch ('/read-all',     NotificationController.markAllAsRead);
router.patch ('/:id/read',     NotificationController.markAsRead);
router.delete('/:id',          NotificationController.delete);

export default router;
