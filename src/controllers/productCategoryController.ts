import { Request, Response, NextFunction } from 'express';
import ProductCategoryService from '../services/productCategoryService';

class ProductCategoryController {

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const category = await ProductCategoryService.create(userId, req.body);
      res.status(201).json({
        success: true,
        message: 'Product category created successfully.',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const categories = await ProductCategoryService.getAll(userId);
      res.status(200).json({
        success: true,
        message: 'Product categories fetched successfully.',
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const category = await ProductCategoryService.getById(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Product category fetched successfully.',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const category = await ProductCategoryService.update(userId, req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Product category updated successfully.',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      await ProductCategoryService.delete(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Product category deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new ProductCategoryController();
