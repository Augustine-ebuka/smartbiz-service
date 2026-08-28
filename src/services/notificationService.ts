import { Notification, INotification, NotificationType, NotificationSeverity } from '../models/notification.model';
import { DebtRecordModel } from '../models/debtrecord';
import { Invoice } from '../models/invoice.model';
import '../models/customer.model'; // registers the Customer schema for the debt .populate() below

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateNotificationDTO {
  userId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  resourceType: 'product' | 'debt' | 'invoice' | 'transaction';
  resourceId: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class NotificationService {

  /**
   * Creates a notification, but skips it if an UNREAD one already exists for
   * the exact same (userId, type, resourceId). Without this, a condition that
   * persists across multiple checks (a product sitting below its low-stock
   * threshold for a week, a debt that's been overdue for days) would spam a
   * fresh notification every single time — daily cron run, every stock
   * movement, etc. Once the user reads it, a new one can be raised if the
   * condition still applies (or recurs after being resolved).
   */
  async createIfNotDuplicate(dto: CreateNotificationDTO): Promise<INotification | null> {
    const existing = await Notification.findOne({
      userId: dto.userId,
      type: dto.type,
      resourceId: dto.resourceId,
      read: false,
    });
    if (existing) return null;

    return Notification.create(dto);
  }

  async getAll(
    userId: string,
    opts: { unreadOnly?: boolean; type?: NotificationType; page?: number; limit?: number } = {}
  ): Promise<{ notifications: INotification[]; total: number; unreadCount: number; page: number; totalPages: number }> {
    const page  = opts.page  ?? 1;
    const limit = opts.limit ?? 20;

    const query: Record<string, any> = { userId };
    if (opts.unreadOnly) query.read = false;
    if (opts.type) query.type = opts.type;

    const skip = (page - 1) * limit;
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId, read: false }),
    ]);

    return { notifications, total, unreadCount, page, totalPages: Math.ceil(total / limit) };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return Notification.countDocuments({ userId, read: false });
  }

  async markAsRead(userId: string, notificationId: string): Promise<INotification> {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    );
    if (!notification) throw new Error('Notification not found.');
    return notification;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await Notification.updateMany(
      { userId, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    return result.modifiedCount;
  }

  async delete(userId: string, notificationId: string): Promise<void> {
    const result = await Notification.findOneAndDelete({ _id: notificationId, userId });
    if (!result) throw new Error('Notification not found.');
  }

  /**
   * Scans across ALL businesses for debts and invoices due within the next
   * few days (or already overdue) and raises notifications. Meant to be run
   * once daily by the cron job — unlike low-stock, there's no single "event"
   * that fires exactly when a due date arrives, so this has to be polled.
   */
  async generateDueDateNotifications(): Promise<{ debtsChecked: number; invoicesChecked: number; created: number }> {
    const DUE_SOON_WINDOW_DAYS = 3;
    const now = new Date();
    const dueSoonCutoff = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    let created = 0;

    // ── Debts ──────────────────────────────────────────────────────────────
    const debts = await DebtRecordModel.find({
      status: 'PENDING',
      dueDate: { $exists: true, $lte: dueSoonCutoff },
    }).populate('customer', 'name');

    for (const debt of debts) {
      const isOverdue    = (debt.dueDate as Date) < now;
      const customerName = (debt.customer as any)?.name ?? 'a customer';

      const message = debt.type === 'THEY_OWE_ME'
        ? `₦${debt.amount.toLocaleString()} owed by ${customerName} is ${isOverdue ? 'overdue' : 'due soon'}.`
        : `You owe ${customerName} ₦${debt.amount.toLocaleString()} — ${isOverdue ? 'overdue' : 'due soon'}.`;

      const result = await this.createIfNotDuplicate({
        userId: debt.userId,
        type: 'debt_due',
        severity: isOverdue ? 'critical' : 'warning',
        title: isOverdue ? 'Debt overdue' : 'Debt due soon',
        message,
        resourceType: 'debt',
        resourceId: (debt._id as any).toString(),
      });
      if (result) created++;
    }

    // ── Invoices ───────────────────────────────────────────────────────────
    const invoices = await Invoice.find({
      status: { $in: ['sent', 'overdue'] },
      dueDate: { $lte: dueSoonCutoff },
    });

    for (const invoice of invoices) {
      const isOverdue = invoice.dueDate < now;

      const result = await this.createIfNotDuplicate({
        userId: invoice.userId,
        type: 'invoice_due',
        severity: isOverdue ? 'critical' : 'warning',
        title: isOverdue ? 'Invoice overdue' : 'Invoice due soon',
        message: `Invoice ${invoice.invoiceNumber} for ${invoice.customerName} (₦${invoice.total.toLocaleString()}) is ${isOverdue ? 'overdue' : 'due soon'}.`,
        resourceType: 'invoice',
        resourceId: (invoice._id as any).toString(),
      });
      if (result) created++;
    }

    return { debtsChecked: debts.length, invoicesChecked: invoices.length, created };
  }

}

export default new NotificationService();
