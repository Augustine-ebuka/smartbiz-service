import { Request, Response, NextFunction } from 'express';
import ExpenseService from '../services/expensesService';

class ExpenseController {

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const expense = await ExpenseService.create(userId, req.body);
      res.status(201).json({
        success: true,
        message: 'Expense logged successfully.',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      // All filter params come from query string:
      // ?categoryId=...&startDate=2026-01-01&endDate=2026-12-31&vendor=...&search=...&page=1&limit=10
      const result = await ExpenseService.getAll(userId, req.query as any);
      res.status(200).json({
        success: true,
        message: 'Expenses fetched successfully.',
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const expense = await ExpenseService.getById(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Expense fetched successfully.',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const expense = await ExpenseService.update(userId, req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Expense updated successfully.',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      await ExpenseService.delete(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Expense deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      const summary = await ExpenseService.getSummary(userId, startDate, endDate);
      res.status(200).json({
        success: true,
        message: 'Expense summary fetched successfully.',
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new ExpenseController();
