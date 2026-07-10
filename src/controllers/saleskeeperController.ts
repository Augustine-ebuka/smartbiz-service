import { Request, Response, NextFunction } from 'express';
import SaleskeeperService from '../services/saleskeeperService';
import { AnyAaaaRecord } from 'dns';

class SaleskeeperController {

  /**
   * POST /api/saleskeepers/invite
   * Body: { name, email }
   * Only business_owner / admin can invite
   */
  async invite(req: any, res: Response, next: NextFunction) {
    try {
      const ownerId = req.businessOwnerId as string;
      const { name, email } = req.body;

      if (!name || !email) {
        res.status(400).json({ success: false, message: 'name and email are required.' });
        return;
      }

      const invite = await SaleskeeperService.invite(ownerId, name, email);
      res.status(201).json({
        success: true,
        message: `Invite sent to ${email}. They can now log in with the credentials sent to their email.`,
        data: invite,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/saleskeepers
   * List all saleskeepers invited by this owner
   */
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.userId as string;
      const saleskeepers = await SaleskeeperService.getAll(ownerId);
      res.status(200).json({
        success: true,
        message: 'Saleskeepers fetched successfully.',
        data: saleskeepers,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/saleskeepers/:id/revoke
   * Deactivate a saleskeeper's access
   */
  async revoke(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.userId as string;
      const invite = await SaleskeeperService.revoke(ownerId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Saleskeeper access revoked.',
        data: invite,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/saleskeepers/:id/reinstate
   * Reinstate a previously revoked saleskeeper
   */
  async reinstate(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.userId as string;
      const invite = await SaleskeeperService.reinstate(ownerId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Saleskeeper access reinstated.',
        data: invite,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/saleskeepers/:id
   * Permanently remove a saleskeeper and their account
   */
  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerId = req.userId as string;
      await SaleskeeperService.remove(ownerId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Saleskeeper removed permanently.',
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new SaleskeeperController();