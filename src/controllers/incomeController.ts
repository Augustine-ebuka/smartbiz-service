import { Request, Response, NextFunction } from 'express';
import IncomeService from '../services/incomeService';

class IncomeController {

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const income = await IncomeService.create(userId, req.body);
      res.status(201).json({
        success: true,
        message: 'Income logged successfully.',
        data: income,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      // Filter params via query string:
      // ?productId=...&customerId=...&paymentMethod=Cash&startDate=...&endDate=...&search=...&page=1&limit=10
      const result = await IncomeService.getAll(userId, req.query as any);
      res.status(200).json({
        success: true,
        message: 'Income records fetched successfully.',
        data: result,
        // meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const income = await IncomeService.getById(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Income record fetched successfully.',
        data: income,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const income = await IncomeService.update(userId, req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Income record updated successfully.',
        data: income,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      await IncomeService.delete(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Income record deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      const summary = await IncomeService.getSummary(userId, startDate, endDate);
      res.status(200).json({
        success: true,
        message: 'Income summary fetched successfully.',
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new IncomeController();
