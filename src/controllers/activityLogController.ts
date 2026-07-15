import { Request, Response, NextFunction } from 'express';
import activityLogService from '../services/activityLogService';
import { ActivityAction } from '../models/activity.model';

class ActivityLogController {

  /**
   * GET /api/activity
   * Query: ?actorId=&action=&startDate=&endDate=&page=&limit=
   */
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const businessOwnerId = (req as any).businessOwnerId as string || '';
      const page  = parseInt(req.query.page  as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters = {
        actorId:   req.query.actorId   as string | undefined,
        action:    req.query.action    as ActivityAction | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate:   req.query.endDate   as string | undefined,
      };

      const result = await activityLogService.getAll(businessOwnerId, filters, page, limit);

      res.status(200).json({
        success: true,
        message: 'Activity log fetched successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/activity/actor/:actorId
   * Quick view — last 10 actions by a specific team member
   */
  async getByActor(req: Request, res: Response, next: NextFunction) {
    try {
      const businessOwnerId = (req as any).businessOwnerId as string || '';
      const limit = parseInt(req.query.limit as string) || 10;
      const logs  = await activityLogService.getByActor(businessOwnerId, req.params.actorId, limit);

      res.status(200).json({
        success: true,
        message: 'Actor activity fetched successfully.',
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new ActivityLogController();