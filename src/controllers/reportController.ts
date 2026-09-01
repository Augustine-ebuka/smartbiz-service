import { Request, Response, NextFunction } from 'express';
import ReportsService, { DateRangeKey } from '../services/reportService';

const VALID_RANGE_KEYS: DateRangeKey[] = ['this-month', 'last-month', 'this-year', 'custom'];

class ReportsController {

  /**
   * GET /api/reports
   * Query params:
   *   range       → "this-month" | "last-month" | "this-year" | "custom"  (default: "this-month")
   *   startDate   → "YYYY-MM-DD"  (required when range=custom)
   *   endDate     → "YYYY-MM-DD"  (required when range=custom)
   */
  async getReports(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;

      const rangeKey  = (req.query.range as DateRangeKey) ?? 'this-month';
      const startDate = req.query.startDate as string | undefined;
      const endDate   = req.query.endDate   as string | undefined;

      if (!VALID_RANGE_KEYS.includes(rangeKey)) {
        res.status(400).json({
          success: false,
          message: `Invalid range. Must be one of: ${VALID_RANGE_KEYS.join(', ')}.`,
        });
        return;
      }

      if (rangeKey === 'custom' && (!startDate || !endDate)) {
        res.status(400).json({
          success: false,
          message: 'startDate and endDate are required when range is "custom".',
        });
        return;
      }

      const data = await ReportsService.getReports(userId, rangeKey, startDate, endDate);

      res.status(200).json({
        success: true,
        message: 'Report fetched successfully.',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reports/products/:productId
   * Query params: same as GET /api/reports (range, startDate, endDate)
   */
  async getProductReport(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const { productId } = req.params;

      const rangeKey  = (req.query.range as DateRangeKey) ?? 'this-month';
      const startDate = req.query.startDate as string | undefined;
      const endDate   = req.query.endDate   as string | undefined;

      if (!VALID_RANGE_KEYS.includes(rangeKey)) {
        res.status(400).json({
          success: false,
          message: `Invalid range. Must be one of: ${VALID_RANGE_KEYS.join(', ')}.`,
        });
        return;
      }

      if (rangeKey === 'custom' && (!startDate || !endDate)) {
        res.status(400).json({
          success: false,
          message: 'startDate and endDate are required when range is "custom".',
        });
        return;
      }

      const data = await ReportsService.getProductReport(userId, productId, rangeKey, startDate, endDate);

      res.status(200).json({
        success: true,
        message: 'Product report fetched successfully.',
        data,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Product not found.') {
        res.status(404).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }

}

export default new ReportsController();