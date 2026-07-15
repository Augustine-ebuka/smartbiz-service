import { Request, Response, NextFunction } from 'express';
import inventoryService from '../services/inventory.service'

class InventoryController {

  /**
   * GET /api/inventory
   * Full inventory overview — all tracked products with stock status
   */
  async getInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const inventory = await inventoryService.getInventory(userId);
      res.status(200).json({
        success: true,
        message: 'Inventory fetched successfully.',
        data: inventory,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventory/low-stock
   * Only products at or below their low stock threshold
   */
  async getLowStock(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const products = await inventoryService.getLowStockProducts(userId);
      res.status(200).json({
        success: true,
        message: 'Low stock products fetched successfully.',
        data: products,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/inventory/:productId/settings
   * Enable tracking, set initial stock, set low stock threshold
   * Body: { trackStock?, stock?, lowStockThreshold? }
   */
  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const product = await inventoryService.updateStockSettings(userId, req.params.productId, req.body);
      res.status(200).json({
        success: true,
        message: 'Stock settings updated successfully.',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/inventory/:productId/adjust
   * Manual stock movement — restock, damage, return, adjustment
   * Body: { quantity, movementType, note? }
   */
  async adjustStock(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).businessOwnerId as string;
      const { quantity, movementType, note } = req.body;

      if (!quantity || !movementType) {
        res.status(400).json({ success: false, message: 'quantity and movementType are required.' });
        return;
      }

      const { product, isLowStock } = await inventoryService.adjustStock(
        userId,
        req.params.productId,
        { quantity, movementType, note }
      );

      res.status(200).json({
        success: true,
        message: 'Stock adjusted successfully.',
        data: product,
        ...(isLowStock && {
          warning: product.stock === 0
            ? `⚠️ "${product.name}" is now out of stock.`
            : `⚠️ "${product.name}" is running low — only ${product.stock} left.`,
        }),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventory/:productId/history
   * Paginated stock movement history for a product
   * Query: ?page=1&limit=20
   */
  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId  = (req as any).businessOwnerId as string;
      const page    = parseInt(req.query.page  as string) || 1;
      const limit   = parseInt(req.query.limit as string) || 20;

      const result = await inventoryService.getHistory(userId, req.params.productId, page, limit);
      res.status(200).json({
        success: true,
        message: 'Stock history fetched successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

}

export default new InventoryController();
