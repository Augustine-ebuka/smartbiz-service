import { Request, Response, NextFunction } from 'express';
import ProductService from '../services/productService';

class ProductController {

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const product = await ProductService.create(userId, req.body);
      res.status(201).json({
        success: true,
        message: 'Product created successfully.',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const products = await ProductService.getAll(userId);
      res.status(200).json({
        success: true,
        message: 'Products fetched successfully.',
        data: products,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const product = await ProductService.getById(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Product fetched successfully.',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const product = await ProductService.update(userId, req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Product updated successfully.',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      await ProductService.delete(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Product deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new ProductController();