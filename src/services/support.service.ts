import { Ticket, ITicket, TicketStatus, TicketPriority, TicketCategory } from '../models/support.model';
import { User } from '../models/user.model';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateTicketDTO {
  category: TicketCategory;
  subject:  string;
  message:  string;
}

export interface ReplyTicketDTO {
  message: string;
}

export interface TicketFilterDTO {
  status?:    TicketStatus;
  priority?:  TicketPriority;
  category?:  TicketCategory;
  assignedTo?: string;
  search?:    string;
  startDate?: string;
  endDate?:   string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class SupportService {

  // ── User actions ────────────────────────────────────────────────────────────

  async createTicket(userId: string, payload: CreateTicketDTO): Promise<ITicket> {
    const user = await User.findById(userId).select('firstName lastName email');
    if (!user) throw new Error('User not found.');

    const ticket = new Ticket({
      userId,
      userName:  `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      category:  payload.category,
      subject:   payload.subject,
      message:   payload.message,
      adminUnreadCount: 1,   // the opening message itself is unread by admin until they view it
    });

    return ticket.save();
  }

  async getUserTickets(
    userId: string,
    page  = 1,
    limit = 10
  ): Promise<{ tickets: any[]; total: number; page: number; totalPages: number }> {
    const query = { userId };
    const skip  = (page - 1) * limit;
    const total = await Ticket.countDocuments(query);

    const rawTickets = await Ticket.find(query)
      .select('-replies')     // don't send full thread in list view
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Expose a single `unreadCount` — unread ADMIN replies, from this customer's side.
    const tickets = rawTickets.map(({ userUnreadCount, adminUnreadCount, ...t }) => ({
      ...t,
      unreadCount: userUnreadCount,
    }));

    return { tickets, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getUserTicketById(userId: string, ticketId: string): Promise<ITicket> {
    const ticket = await Ticket.findOne({ _id: ticketId, userId });
    if (!ticket) throw new Error('Ticket not found.');

    // Viewing the full thread marks the customer's unread admin-replies as read.
    if (ticket.userUnreadCount > 0) {
      ticket.userUnreadCount = 0;
      await ticket.save();
    }

    return ticket;
  }

  // User can reply to their own ticket
  async userReply(userId: string, ticketId: string, payload: ReplyTicketDTO): Promise<ITicket> {
    const user   = await User.findById(userId).select('firstName lastName');
    if (!user) throw new Error('User not found.');

    const ticket = await Ticket.findOne({ _id: ticketId, userId });
    if (!ticket) throw new Error('Ticket not found.');

    if (ticket.status === 'closed') {
      throw new Error('This ticket is closed. Please open a new ticket.');
    }

    // Reopen resolved ticket when user replies
    if (ticket.status === 'resolved') {
      ticket.status = 'open';
    }

    ticket.replies.push({
      _id:        new (require('mongoose').Types.ObjectId)(),
      senderId:   userId,
      senderName: `${user.firstName} ${user.lastName}`,
      senderRole: 'user',
      message:    payload.message,
      createdAt:  new Date(),
    });

    // Replying implies they've seen the thread so far; the admin now has a new unread message.
    ticket.userUnreadCount = 0;
    ticket.adminUnreadCount += 1;

    return ticket.save();
  }

  // ── Admin actions ────────────────────────────────────────────────────────────

  async getAllTickets(
    filters: TicketFilterDTO = {},
    page  = 1,
    limit = 20
  ): Promise<{ tickets: any[]; total: number; page: number; totalPages: number }> {
    const query: Record<string, any> = {};

    if (filters.status)     query.status     = filters.status;
    if (filters.priority)   query.priority   = filters.priority;
    if (filters.category)   query.category   = filters.category;
    if (filters.assignedTo) query.assignedTo = filters.assignedTo;

    if (filters.search) {
      query.$or = [
        { subject:   { $regex: filters.search, $options: 'i' } },
        { userName:  { $regex: filters.search, $options: 'i' } },
        { userEmail: { $regex: filters.search, $options: 'i' } },
        { ticketId:  { $regex: filters.search, $options: 'i' } },
      ];
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate)   query.createdAt.$lte = new Date(`${filters.endDate}T23:59:59.999Z`);
    }

    const skip  = (page - 1) * limit;
    const total = await Ticket.countDocuments(query);

    const rawTickets = await Ticket.find(query)
      .select('-replies')
      .sort({ priority: -1, createdAt: -1 })   // urgent first, then newest
      .skip(skip)
      .limit(limit)
      .lean();

    // Expose a single `unreadCount` — unread CUSTOMER messages, from the admin's side.
    const tickets = rawTickets.map(({ userUnreadCount, adminUnreadCount, ...t }) => ({
      ...t,
      unreadCount: adminUnreadCount,
    }));

    return { tickets, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getTicketById(ticketId: string): Promise<ITicket> {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found.');

    // Viewing the full thread marks the admin's unread customer-messages as read.
    if (ticket.adminUnreadCount > 0) {
      ticket.adminUnreadCount = 0;
      await ticket.save();
    }

    return ticket;
  }

  async adminReply(
    adminId:   string,
    ticketId:  string,
    payload:   ReplyTicketDTO
  ): Promise<ITicket> {
    const admin  = await User.findById(adminId).select('firstName lastName');
    if (!admin) throw new Error('Admin not found.');

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found.');
    if (ticket.status === 'closed') throw new Error('Ticket is closed.');

    // Set firstReplyAt only on first admin reply
    if (!ticket.firstReplyAt) {
      ticket.firstReplyAt = new Date();
    }

    // Auto move to in_progress when admin first replies
    if (ticket.status === 'open') {
      ticket.status = 'in_progress';
    }

    ticket.replies.push({
      _id:        new (require('mongoose').Types.ObjectId)(),
      senderId:   adminId,
      senderName: `${admin.firstName} ${admin.lastName}`,
      senderRole: 'admin',
      message:    payload.message,
      createdAt:  new Date(),
    });

    // Replying implies the admin has seen the thread so far; the customer now has a new unread message.
    ticket.adminUnreadCount = 0;
    ticket.userUnreadCount += 1;

    return ticket.save();
  }

  async updateStatus(ticketId: string, status: TicketStatus): Promise<ITicket> {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found.');

    ticket.status = status;
    if (status === 'resolved') ticket.resolvedAt = new Date();
    if (status === 'closed')   ticket.closedAt   = new Date();

    return ticket.save();
  }

  async updatePriority(ticketId: string, priority: TicketPriority): Promise<ITicket> {
    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      { $set: { priority } },
      { new: true }
    );
    if (!ticket) throw new Error('Ticket not found.');
    return ticket;
  }

  async assignTicket(ticketId: string, adminId: string): Promise<ITicket> {
    const admin = await User.findById(adminId).select('firstName lastName role');
    if (!admin || admin.role !== 'admin') throw new Error('Admin user not found.');

    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      {
        $set: {
          assignedTo:   adminId,
          assignedName: `${admin.firstName} ${admin.lastName}`,
          status:       'in_progress',
        },
      },
      { new: true }
    );
    if (!ticket) throw new Error('Ticket not found.');
    return ticket;
  }

  async bulkUpdateStatus(ticketIds: string[], status: TicketStatus): Promise<number> {
    const result = await Ticket.updateMany(
      { _id: { $in: ticketIds } },
      {
        $set: {
          status,
          ...(status === 'resolved' && { resolvedAt: new Date() }),
          ...(status === 'closed'   && { closedAt:   new Date() }),
        },
      }
    );
    return result.modifiedCount;
  }

  // ── Admin dashboard stats ────────────────────────────────────────────────────

  async getStats() {
    const [
      total,
      byStatus,
      byPriority,
      byCategory,
      avgResolutionTime,
    ] = await Promise.all([

      Ticket.countDocuments(),

      Ticket.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      Ticket.aggregate([
        { $match: { status: { $in: ['open', 'in_progress'] } } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),

      Ticket.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Avg resolution time in hours for resolved tickets
      Ticket.aggregate([
        { $match: { status: 'resolved', resolvedAt: { $exists: true } } },
        {
          $project: {
            resolutionHours: {
              $divide: [
                { $subtract: ['$resolvedAt', '$createdAt'] },
                1000 * 60 * 60,   // ms → hours
              ],
            },
          },
        },
        { $group: { _id: null, avgHours: { $avg: '$resolutionHours' } } },
      ]),
    ]);

    // Format byStatus into a readable object
    const statusMap: Record<string, number> = {
      open: 0, in_progress: 0, resolved: 0, closed: 0,
    };
    byStatus.forEach((s: any) => { statusMap[s._id] = s.count; });

    return {
      total,
      open:          statusMap.open,
      inProgress:    statusMap.in_progress,
      resolved:      statusMap.resolved,
      closed:        statusMap.closed,
      byPriority:    byPriority.map((p: any) => ({ priority: p._id, count: p.count })),
      byCategory:    byCategory.map((c: any) => ({ category: c._id, count: c.count })),
      avgResolutionTimeHours: avgResolutionTime[0]
        ? Math.round(avgResolutionTime[0].avgHours * 10) / 10
        : null,
    };
  }

}

export default new SupportService();
