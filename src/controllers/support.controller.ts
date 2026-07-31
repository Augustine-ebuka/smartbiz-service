import { Request, Response, NextFunction } from 'express';
import SupportService from '../services/support.service';

class SupportController {

  // ── User endpoints ───────────────────────────────────────────────────────────

  async createTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      const { category, subject, message } = req.body;

      if (!category || !subject || !message) {
        res.status(400).json({ success: false, message: 'category, subject and message are required.' });
        return;
      }

      const ticket = await SupportService.createTicket(userId, { category, subject, message });
      res.status(201).json({
        success: true,
        message: `Ticket ${ticket.ticketId} created. We'll follow up at your email.`,
        data:    ticket,
      });
    } catch (error) { next(error); }
  }

  async getUserTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      const page   = parseInt(req.query.page  as string) || 1;
      const limit  = parseInt(req.query.limit as string) || 10;
      const result = await SupportService.getUserTickets(userId, page, limit);
      res.status(200).json({ success: true, message: 'Tickets fetched.', data: result });
    } catch (error) { next(error); }
  }

  async getUserTicketById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      const ticket = await SupportService.getUserTicketById(userId, req.params.id);
      res.status(200).json({ success: true, message: 'Ticket fetched.', data: ticket });
    } catch (error) { next(error); }
  }

  async userReply(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      const { message } = req.body;
      if (!message) {
        res.status(400).json({ success: false, message: 'message is required.' });
        return;
      }
      const ticket = await SupportService.userReply(userId, req.params.id, { message });
      res.status(200).json({ success: true, message: 'Reply sent.', data: ticket });
    } catch (error) { next(error); }
  }

  // ── Admin endpoints ──────────────────────────────────────────────────────────

  async getAllTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const page   = parseInt(req.query.page  as string) || 1;
      const limit  = parseInt(req.query.limit as string) || 20;
      const result = await SupportService.getAllTickets(req.query as any, page, limit);
      res.status(200).json({ success: true, message: 'Tickets fetched.', data: result });
    } catch (error) { next(error); }
  }

  async getTicketById(req: Request, res: Response, next: NextFunction) {
    try {
      const ticket = await SupportService.getTicketById(req.params.id);
      res.status(200).json({ success: true, message: 'Ticket fetched.', data: ticket });
    } catch (error) { next(error); }
  }

  async adminReply(req: Request, res: Response, next: NextFunction) {
    try {
      const adminId = req.userId as string;
      const { message } = req.body;
      if (!message) {
        res.status(400).json({ success: false, message: 'message is required.' });
        return;
      }
      const ticket = await SupportService.adminReply(adminId, req.params.id, { message });
      res.status(200).json({ success: true, message: 'Reply sent.', data: ticket });
    } catch (error) { next(error); }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      if (!status) {
        res.status(400).json({ success: false, message: 'status is required.' });
        return;
      }
      const ticket = await SupportService.updateStatus(req.params.id, status);
      res.status(200).json({ success: true, message: 'Status updated.', data: ticket });
    } catch (error) { next(error); }
  }

  async updatePriority(req: Request, res: Response, next: NextFunction) {
    try {
      const { priority } = req.body;
      if (!priority) {
        res.status(400).json({ success: false, message: 'priority is required.' });
        return;
      }
      const ticket = await SupportService.updatePriority(req.params.id, priority);
      res.status(200).json({ success: true, message: 'Priority updated.', data: ticket });
    } catch (error) { next(error); }
  }

  async assignTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const { adminId } = req.body;
      if (!adminId) {
        res.status(400).json({ success: false, message: 'adminId is required.' });
        return;
      }
      const ticket = await SupportService.assignTicket(req.params.id, adminId);
      res.status(200).json({ success: true, message: 'Ticket assigned.', data: ticket });
    } catch (error) { next(error); }
  }

  async bulkUpdateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { ticketIds, status } = req.body;
      if (!ticketIds?.length || !status) {
        res.status(400).json({ success: false, message: 'ticketIds and status are required.' });
        return;
      }
      const count = await SupportService.bulkUpdateStatus(ticketIds, status);
      res.status(200).json({ success: true, message: `${count} tickets updated.`, data: { count } });
    } catch (error) { next(error); }
  }

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await SupportService.getStats();
      res.status(200).json({ success: true, message: 'Support stats fetched.', data: stats });
    } catch (error) { next(error); }
  }

}

export default new SupportController();
