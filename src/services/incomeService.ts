import { Income, IIncome, PaymentMethod } from '../models/income.model';
import { Product } from '../models/product.model';
import { Customer } from '../models/customer.model';
import { User } from '../models/user.model';
import { Expense } from '../models/expense.model';
import { ExpenseCategory } from '../models/expenseCategory.model';
import inventoryService from './inventory.service';
import activityLogService from './activityLogService';
import ApiError from '../utils/ApiError';
import TaxService, { VAT_RATE } from './tax.service';

async function getActorInfo(userId: string): Promise<{ actorName: string; actorRole: string }> {
  const actor = await User.findById(userId).select('firstName lastName role');
  return {
    actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'Unknown',
    actorRole: actor?.role ?? 'unknown',
  };
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateIncomeDTO {
  productId?: string;
  unit?: number;
  amount: number;
  costAmount?: number;
  customerId?: string;
  paymentMethod?: PaymentMethod;
  date?: Date | string;
  note?: string;
  vat?: boolean;
  vatAmount?: number;
  // returned is deliberately NOT settable here — it can only be flipped via
  // markAsReturned(), which also restocks inventory and records a refund
  // expense. Allowing it through generic create/update would let a plain
  // PATCH silently flag a sale as returned with none of those side effects.
}

export interface UpdateIncomeDTO extends Partial<CreateIncomeDTO> {}

export interface IncomeFilterDTO {
  productId?: string;
  customerId?: string;
  paymentMethod?: PaymentMethod;
  startDate?: string;
  endDate?: string;
  search?: string;
  receiptId?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class IncomeService {

  async create(userId: string, payload: CreateIncomeDTO, actorId?: string): Promise<IIncome & { inventoryWarning?: string }> {
    let product = null;
    if (payload.productId) {
      product = await Product.findOne({ _id: payload.productId, userId });
      if (!product) throw new Error('Product not found.');
    }

    if (payload.customerId) {
      const customer = await Customer.findOne({ _id: payload.customerId, userId });
      if (!customer) throw new Error('Customer not found.');
    }

    // Strip `returned` and `receiptId` even though the DTO type doesn't offer
    // them — payload arrives as untyped req.body at the HTTP boundary. A
    // brand-new sale can never start out already-returned, and receiptId must
    // always come from the server-side auto-generator (schema pre-save hook)
    // so it stays unique — a client-supplied value (e.g. one ID reused across
    // a batch of grouped income entries) would otherwise hit the unique index.
    const { returned: _ignoredReturned, receiptId: _ignoredReceiptId, ...safePayload } = payload as CreateIncomeDTO & { returned?: boolean; receiptId?: string };

    const unit = payload.unit ?? 1;

    // Auto-fill cost from the product's costPrice unless the caller explicitly
    // passed their own costAmount (a manual override always wins). Without
    // this, costAmount silently stays 0 and profit reporting is meaningless —
    // recording cost once on the product beats asking for it on every sale.
    const costAmount = payload.costAmount ?? (product?.costPrice != null ? product.costPrice * unit : 0);

    // Auto-compute VAT the same way: only if this sale is flagged VAT-able
    // AND the business is actually VAT-registered (an unregistered business
    // can't legally charge VAT, so the flag alone isn't trusted). amount is
    // always the full amount actually received, so the VAT portion is backed
    // out of it: vatAmount = amount * rate / (1 + rate).
    let vatAmount = payload.vatAmount ?? 0;
    if (payload.vat && payload.vatAmount === undefined) {
      const taxSettings = await TaxService.getSettings(userId);
      if (taxSettings.vatRegistered) {
        vatAmount = Math.round(((payload.amount * VAT_RATE) / (1 + VAT_RATE)) * 100) / 100;
      }
    }

    const income = new Income({
      userId,
      ...safePayload,
      unit,
      costAmount,
      vatAmount,
      paymentMethod: payload.paymentMethod ?? 'Cash',
      date:          payload.date ? new Date(payload.date) : new Date(),
    });

    // receiptId is generated from a countDocuments snapshot (see income.model.ts),
    // which isn't atomic — two saves for the same user landing at the same time
    // (e.g. a "group incomes" batch fired concurrently) can compute the same
    // number and collide on the unique index. Retry a few times, letting the
    // pre-save hook recompute a fresh count each attempt, before giving up.
    const MAX_RECEIPT_ID_RETRIES = 5;
    for (let attempt = 1; ; attempt++) {
      try {
        await income.save();
        break;
      } catch (error: any) {
        const isReceiptIdCollision = error?.code === 11000 && error?.keyPattern?.receiptId;
        if (!isReceiptIdCollision || attempt >= MAX_RECEIPT_ID_RETRIES) throw error;
        income.receiptId = undefined as any;
      }
    }

    const { actorName, actorRole } = await getActorInfo(actorId ?? userId);

    // ── Auto-deduct stock if product tracks inventory ──────────────────────
    let inventoryWarning: string | undefined;

    if (payload.productId) {
      const { isLowStock, stockAfter } = await inventoryService.deductForSale(
        userId,
        payload.productId,
        payload.unit ?? 1,
        income._id.toString(),
        actorId ?? userId,
        actorName
      );

      if (isLowStock) {
        const product = await Product.findById(payload.productId).select('name');
        inventoryWarning = stockAfter === 0
          ? `⚠️ "${product?.name}" is now out of stock.`
          : `⚠️ "${product?.name}" is running low — only ${stockAfter} left.`;
      }
    }

    await activityLogService.log({
      businessOwnerId: userId,
      actorId: actorId ?? userId,
      actorName,
      actorRole,
      action: 'income.create',
      description: payload.note || 'Income logged',
      resourceId: income._id,
      amount: payload.amount,
    });

    return Object.assign(income, { inventoryWarning });
  }


  async getAll(userId: string, filters: IncomeFilterDTO = {}): Promise<IIncome[]> {
     const query: Record<string, any> = { userId };
 
     if (filters.productId)     query.productId     = filters.productId;
     if (filters.customerId)    query.customerId    = filters.customerId;
     if (filters.paymentMethod) query.paymentMethod = filters.paymentMethod;
     if (filters.receiptId)     query.receiptId     = filters.receiptId;

     if (filters.startDate || filters.endDate) {
       query.date = {};
       if (filters.startDate) query.date.$gte = new Date(filters.startDate);
       if (filters.endDate)   query.date.$lte = new Date(filters.endDate);
     }

     if (filters.search) {
       query.$or = [
         { note:      { $regex: filters.search, $options: 'i' } },
         { receiptId: { $regex: filters.search, $options: 'i' } },
       ];
     }
 
     return Income.find(query)
       .populate('productId',  'name type price')
       .populate('customerId', 'name email phone')
       .sort({ date: -1 });
   }

  async getById(userId: string, incomeId: string): Promise<IIncome> {
    const income = await Income.findOne({ _id: incomeId, userId })
      .populate('productId',  'name type price')
      .populate('customerId', 'name email phone');
    if (!income) throw new Error('Income record not found.');
    return income;
  }

  async update(userId: string, incomeId: string, payload: UpdateIncomeDTO, actorId?: string): Promise<IIncome> {
    if (payload.productId) {
      const product = await Product.findOne({ _id: payload.productId, userId });
      if (!product) throw new Error('Product not found.');
    }

    if (payload.customerId) {
      const customer = await Customer.findOne({ _id: payload.customerId, userId });
      if (!customer) throw new Error('Customer not found.');
    }

    // Strip `returned` and `receiptId` even though the DTO type no longer
    // offers them — payload arrives as untyped req.body at the HTTP boundary,
    // so a raw client could still send them. Only markAsReturned() may flip
    // the returned flag, and receiptId is server-generated and must stay
    // immutable once assigned.
    const { returned: _ignoredReturned, receiptId: _ignoredReceiptId, ...safePayload } = payload as UpdateIncomeDTO & { returned?: boolean; receiptId?: string };

    const income = await Income.findOneAndUpdate(
      { _id: incomeId, userId },
      {
        $set: {
          ...safePayload,
          ...(payload.date && { date: new Date(payload.date as string) }),
        },
      },
      { new: true, runValidators: true }
    )
      .populate('productId',  'name type price')
      .populate('customerId', 'name email phone');

    if (!income) throw new Error('Income record not found.');

    const { actorName, actorRole } = await getActorInfo(actorId ?? userId);
    await activityLogService.log({
      businessOwnerId: userId,
      actorId: actorId ?? userId,
      actorName,
      actorRole,
      action: 'income.update',
      description: income.note || 'Income record updated',
      resourceId: income._id,
      amount: income.amount,
    });

    return income;
  }

  async delete(userId: string, incomeId: string, actorId?: string): Promise<void> {
    const result = await Income.findOneAndDelete({ _id: incomeId, userId });
    if (!result) throw new Error('Income record not found.');

    const { actorName, actorRole } = await getActorInfo(actorId ?? userId);
    await activityLogService.log({
      businessOwnerId: userId,
      actorId: actorId ?? userId,
      actorName,
      actorRole,
      action: 'income.delete',
      description: 'Income record deleted',
      resourceId: incomeId,
      amount: result.amount,
    });
  }

  /**
   * Marks a sale as returned: restocks the item (if it tracks inventory),
   * records a matching refund expense (so cash-flow reflects the money paid
   * back out), and flags the original income record. The original income
   * record is left untouched/still counted historically — the refund expense
   * is what nets it out in profit — so both the sale and its reversal stay
   * visible rather than making the sale disappear from reports.
   */
  async markAsReturned(userId: string, incomeId: string, actorId?: string, note?: string): Promise<IIncome> {
    const income = await Income.findOne({ _id: incomeId, userId });
    if (!income) throw new ApiError(404, 'Income record not found.');
    if (income.returned) throw new ApiError(400, 'This sale is already marked as returned.');

    const { actorName, actorRole } = await getActorInfo(actorId ?? userId);

    // Restock — best-effort. A sale can be returned even if the product was
    // since deleted or never tracked stock; don't let that block the refund.
    if (income.productId) {
      try {
        await inventoryService.recordMovement(userId, {
          productId: income.productId.toString(),
          quantity: income.unit,
          movementType: 'return',
          referenceId: income._id.toString(),
          note: note || 'Customer return',
          actorId: actorId ?? userId,
          actorName,
        });
      } catch (error) {
        console.error(`[Income] Restock on return failed for income ${incomeId}:`, error);
      }
    }

    // Refund expense — find-or-create a "Refunds" category for this business.
    let refundCategory = await ExpenseCategory.findOne({
      userId,
      name: { $regex: '^Refunds$', $options: 'i' },
    });
    if (!refundCategory) {
      refundCategory = await ExpenseCategory.create({ userId, name: 'Refunds' });
    }

    const refundExpense = await Expense.create({
      userId,
      amount: income.amount,
      categoryId: refundCategory._id,
      note: note || `Refund for returned sale (receipt ${income.receiptId})`,
    });

    income.returned = true;
    await income.save();

    await activityLogService.log({
      businessOwnerId: userId,
      actorId: actorId ?? userId,
      actorName,
      actorRole,
      action: 'income.mark_returned',
      description: `Sale marked as returned (receipt ${income.receiptId})${note ? ` — ${note}` : ''}`,
      resourceId: incomeId,
      amount: income.amount,
      metadata: { refundExpenseId: refundExpense._id.toString() },
    });

    return income;
  }

  // ─── Summary / Analytics ──────────────────────────────────────────────────

  async getSummary(userId: string, startDate?: string, endDate?: string) {
    const matchStage: Record<string, any> = { userId };

    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate)   matchStage.date.$lte = new Date(endDate);
    }

    const [totals, byPaymentMethod, byProduct, byCustomer] = await Promise.all([
      // Total income + cost (for gross profit — see return below)
      Income.aggregate([
        { $match: matchStage },
        { $group: { _id: null, total: { $sum: '$amount' }, totalCost: { $sum: '$costAmount' }, count: { $sum: 1 } } },
      ]),

      // Breakdown by payment method
      Income.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$paymentMethod',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),

      // Breakdown by product/service
      Income.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$productId',
            total: { $sum: '$amount' },
            totalCost: { $sum: '$costAmount' },
            unitsSold: { $sum: '$unit' },
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productName: { $ifNull: ['$product.name', 'Custom / No product'] },
            total: 1,
            totalCost: 1,
            grossProfit: { $subtract: ['$total', '$totalCost'] },
            unitsSold: 1,
            count: 1,
          },
        },
        { $sort: { total: -1 } },
      ]),

      // Breakdown by customer
      Income.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$customerId',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'customers',
            localField: '_id',
            foreignField: '_id',
            as: 'customer',
          },
        },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            customerName: { $ifNull: ['$customer.name', 'Walk-in / No customer'] },
            total: 1,
            count: 1,
          },
        },
        { $sort: { total: -1 } },
      ]),
    ]);

    const total     = totals[0]?.total ?? 0;
    const totalCost = totals[0]?.totalCost ?? 0;

    return {
      total,
      count: totals[0]?.count ?? 0,
      totalCost,
      grossProfit: total - totalCost,
      byPaymentMethod,
      byProduct,
      byCustomer,
    };
  }

}

export default new IncomeService();
