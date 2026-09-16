import { Request, Response, NextFunction } from 'express';
import DashboardService, { DashboardPeriod, DashboardPeriodOptions } from '../services/dashboardService';

const VALID_PERIODS: DashboardPeriod[] = ['today', 'yesterday', 'custom', 'month', 'year'];

class DashboardController {

  async getDashboard(req: any, res: Response, next: NextFunction) {
    try {
      const userId = req.businessOwnerId as string;

      const periodParam = (req.query.period as string) || 'today';
      if (!VALID_PERIODS.includes(periodParam as DashboardPeriod)) {
        res.status(400).json({
          success: false,
          message: `Invalid "period" query param. Must be one of: ${VALID_PERIODS.join(', ')}.`,
        });
        return;
      }
      const period = periodParam as DashboardPeriod;

      const periodOptions: DashboardPeriodOptions = {
        date: req.query.date as string | undefined,
      };
      if (req.query.month !== undefined) periodOptions.month = parseInt(req.query.month as string, 10);
      if (req.query.year !== undefined)  periodOptions.year  = parseInt(req.query.year as string, 10);

      const data = await DashboardService.getDashboard(userId, period, periodOptions);
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
