import { Product } from '../models/product.model';
import { StockHistory, StockMovementType } from '../models/stockHistory.model';
import { User } from '../models/user.model';
import activityLogService from './activityLogService';
import notificationService from './notificationService';

async function getActorInfo(userId: string): Promise<{ actorName: string; actorRole: string }> {
  const actor = await User.findById(userId).select('firstName lastName role');
  return {
    actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'Owner',
    actorRole: actor?.role ?? 'unknown',
  };
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface StockMovementDTO {
  productId: string;
  quantity: number;
  movementType: StockMovementType;
  note?: string;
  referenceId?: string;        // incomeId when called from income service
  actorId: string;
  actorName: string;
}

export interface AdjustStockDTO {
  quantity: number;
  movementType: 'restock' | 'adjustment' | 'return' | 'damage';
  note?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class InventoryService {

  /**
   * Core movement method — used internally by all other methods.
   * Atomically updates stock and writes a history record.
   */
  async recordMovement(userId: string, dto: StockMovementDTO): Promise<void> {
    const product = await Product.findOne({ _id: dto.productId, userId });
    if (!product) throw new Error('Product not found.');
    if (!product.trackStock) return;   // silently skip — service products don't track stock

    const direction = this.getDirection(dto.movementType);
    const stockBefore = product.stock;
    let   stockAfter  = direction === 'in'
      ? stockBefore + dto.quantity
      : stockBefore - dto.quantity;

    // Never go below 0
    if (stockAfter < 0) stockAfter = 0;

    // Atomically update stock
    await Product.findByIdAndUpdate(dto.productId, { $set: { stock: stockAfter } });

    // Write history record
    await StockHistory.create({
      userId,
      productId:   dto.productId,
      productName: product.name,
      movementType: dto.movementType,
      quantity:    dto.quantity,
      direction,
      stockBefore,
      stockAfter,
      referenceId: dto.referenceId,
      note:        dto.note,
      actorId:     dto.actorId,
      actorName:   dto.actorName,
    });

    // Low-stock notification — every stock change funnels through this one
    // method, so this is the single place to catch it rather than scattering
    // the check across adjustStock/deductForSale/updateStockSettings.
    // createIfNotDuplicate skips it if an unread one already exists for this
    // product, so staying low doesn't spam a fresh notification on every sale.
    if (stockAfter <= product.lowStockThreshold) {
      await notificationService.createIfNotDuplicate({
        userId,
        type: 'low_stock',
        severity: stockAfter === 0 ? 'critical' : 'warning',
        title: stockAfter === 0 ? 'Out of stock' : 'Running low on stock',
        message: stockAfter === 0
          ? `"${product.name}" is now out of stock.`
          : `"${product.name}" is running low — only ${stockAfter} left.`,
        resourceType: 'product',
        resourceId: dto.productId,
      });
    }
  }

  /**
   * Called from IncomeService when a sale is logged against a product.
   * Deducts `unit` quantity from stock.
   */
  async deductForSale(
    userId: string,
    productId: string,
    quantity: number,
    incomeId: string,
    actorId: string,
    actorName: string
  ): Promise<{ isLowStock: boolean; stockAfter: number }> {
    const product = await Product.findOne({ _id: productId, userId });
    if (!product || !product.trackStock) {
      return { isLowStock: false, stockAfter: 0 };
    }

    await this.recordMovement(userId, {
      productId,
      quantity,
      movementType: 'sale',
      referenceId:  incomeId,
      note:         `Auto-deducted from sale`,
      actorId,
      actorName,
    });

    // Refetch to get updated stock
    const updated = await Product.findById(productId).select('stock lowStockThreshold');
    const stockAfter  = updated?.stock ?? 0;
    const isLowStock  = stockAfter <= (updated?.lowStockThreshold ?? 5);

    return { isLowStock, stockAfter };
  }

  /**
   * Manual stock adjustment by owner — restock, damage, return, correction.
   */
  async adjustStock(
    userId: string,
    productId: string,
    payload: AdjustStockDTO,
    actorId?: string
  ): Promise<{ product: any; isLowStock: boolean }> {
    const product = await Product.findOne({ _id: productId, userId });
    if (!product) throw new Error('Product not found.');
    if (!product.trackStock) throw new Error('Stock tracking is not enabled for this product.');

    const { actorName, actorRole } = await getActorInfo(actorId ?? userId);

    await this.recordMovement(userId, {
      productId,
      quantity:     payload.quantity,
      movementType: payload.movementType,
      note:         payload.note,
      actorId:      actorId ?? userId,
      actorName,
    });

    const updated    = await Product.findById(productId);
    const isLowStock = (updated?.stock ?? 0) <= (updated?.lowStockThreshold ?? 5);

    await activityLogService.log({
      businessOwnerId: userId,
      actorId: actorId ?? userId,
      actorName,
      actorRole,
      action: 'stock.adjust',
      description: `${payload.movementType} of ${payload.quantity} for "${product.name}"${payload.note ? ` — ${payload.note}` : ''}`,
      resourceId: productId,
      metadata: { movementType: payload.movementType, quantity: payload.quantity, stockAfter: updated?.stock },
    });

    return { product: updated, isLowStock };
  }

  /**
   * Enable or update stock tracking settings on a product.
   */
  async updateStockSettings(
    userId: string,
    productId: string,
    payload: { trackStock?: boolean; stock?: number; lowStockThreshold?: number },
    actorId?: string
  ): Promise<any> {
    const product = await Product.findOne({ _id: productId, userId });
    if (!product) throw new Error('Product not found.');

    const update: Record<string, any> = {};
    if (payload.trackStock          !== undefined) update.trackStock          = payload.trackStock;
    if (payload.lowStockThreshold   !== undefined) update.lowStockThreshold   = payload.lowStockThreshold;

    const { actorName, actorRole } = await getActorInfo(actorId ?? userId);

    // If setting initial stock, write a history record
    if (payload.stock !== undefined && payload.stock !== product.stock) {
      const stockBefore = product.stock;
      update.stock      = payload.stock;

      await Product.findByIdAndUpdate(productId, { $set: update });

      await StockHistory.create({
        userId,
        productId,
        productName:  product.name,
        movementType: 'initial',
        quantity:     Math.abs(payload.stock - stockBefore),
        direction:    payload.stock >= stockBefore ? 'in' : 'out',
        stockBefore,
        stockAfter:   payload.stock,
        note:         'Stock manually set',
        actorId:      actorId ?? userId,
        actorName,
      });

      await activityLogService.log({
        businessOwnerId: userId,
        actorId: actorId ?? userId,
        actorName,
        actorRole,
        action: 'stock.settings_update',
        description: `Stock settings updated for "${product.name}" (stock set to ${payload.stock})`,
        resourceId: productId,
        metadata: { ...payload, stockBefore },
      });

      return Product.findById(productId);
    }

    const updated = await Product.findByIdAndUpdate(productId, { $set: update }, { new: true });

    await activityLogService.log({
      businessOwnerId: userId,
      actorId: actorId ?? userId,
      actorName,
      actorRole,
      action: 'stock.settings_update',
      description: `Stock settings updated for "${product.name}"`,
      resourceId: productId,
      metadata: payload,
    });

    return updated;
  }

  /**
   * Get stock history for a product with pagination.
   */
  async getHistory(
    userId: string,
    productId: string,
    page = 1,
    limit = 20
  ) {
    const query  = { userId, productId };
    const skip   = (page - 1) * limit;
    const total  = await StockHistory.countDocuments(query);
    const history = await StockHistory.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return { history, total, page, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get all low stock products for a business.
   */
  async getLowStockProducts(userId: string) {
    return Product.find({
      userId,
      trackStock: true,
      $expr: { $lte: ['$stock', '$lowStockThreshold'] },
    }).sort({ stock: 1 });
  }

  /**
   * Get full inventory overview — all tracked products with stock levels.
   */
  async getInventory(userId: string) {
    const products = await Product.find({ userId, trackStock: true })
      .sort({ name: 1 });

    return products.map(p => ({
      _id:               p._id,
      name:              p.name,
      type:              p.type,
      price:             p.price,
      costPrice:         p.costPrice ?? null,
      stock:             p.stock,
      lowStockThreshold: p.lowStockThreshold,
      isLowStock:        p.stock <= p.lowStockThreshold,
      status:            p.stock === 0
        ? 'out_of_stock'
        : p.stock <= p.lowStockThreshold
          ? 'low_stock'
          : 'in_stock',
      // Profit if all current stock sells at `price`. null (not 0) when
      // costPrice isn't set — there's no honest profit figure without it.
      expectedProfit: p.costPrice != null ? (p.price - p.costPrice) * p.stock : null,
    }));
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private getDirection(movementType: StockMovementType): 'in' | 'out' {
    const inTypes: StockMovementType[] = ['restock', 'return', 'initial'];
    return inTypes.includes(movementType) ? 'in' : 'out';
  }

}

export default new InventoryService();
