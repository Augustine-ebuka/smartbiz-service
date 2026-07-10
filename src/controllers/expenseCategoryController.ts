import { Request, Response, NextFunction } from 'express';
import ExpenseCategoryService from '../services/expenseService';

class ExpenseCategoryController {

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const category = await ExpenseCategoryService.create(userId, req.body);
      res.status(201).json({
        success: true,
        message: 'Expense category created successfully.',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const categories = await ExpenseCategoryService.getAll(userId);
      res.status(200).json({
        success: true,
        message: 'Expense categories fetched successfully.',
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const category = await ExpenseCategoryService.getById(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Expense category fetched successfully.',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const category = await ExpenseCategoryService.update(userId, req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Expense category updated successfully.',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      await ExpenseCategoryService.delete(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Expense category deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new ExpenseCategoryController();