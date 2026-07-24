import { Request, Response, NextFunction } from 'express';
import CustomerService from '../services/customerService';

class CustomerController {

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      console.log(req.body);
      
      const userId = (req as any).businessOwnerId as string || '';
      if (!userId) {
        throw new Error('Business owner ID is required.');
      }
      const customer = await CustomerService.create(userId, req.body);
      res.status(201).json({
        success: true,
        message: 'Customer created successfully.',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

async getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).businessOwnerId as string || '';
    const page   = parseInt(req.query.page  as string) || 1;
    const limit  = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string | undefined;

    const result = await CustomerService.getAll(userId, page, limit, search);

    res.status(200).json({
      success: true,
      message: 'Customers fetched successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const customer = await CustomerService.getById(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Customer fetched successfully.',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const customer = await CustomerService.update(userId, req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Customer updated successfully.',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId as string;
      await CustomerService.delete(userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Customer deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new CustomerController();