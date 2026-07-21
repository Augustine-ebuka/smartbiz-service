import { Request, Response, NextFunction } from 'express';
import DashboardService from '../services/dashboardService';

class DashboardController {

  async getDashboard(req: any, res: Response, next: NextFunction) {
    try {
      const userId = req.businessOwnerId as string;
      console.log(userId, "userId ..............................");
      const data = await DashboardService.getDashboard(userId);
      res.status(200).json({
        success: true,
        message: 'Dashboard data fetched successfully.',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new DashboardController();