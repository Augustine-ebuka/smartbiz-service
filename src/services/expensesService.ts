import { Expense, IExpense } from '../models/expense.model';
import { ExpenseCategory } from '../models/expenseCategory.model';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateExpenseDTO {
  amount: number;
  categoryId?: string;
  date?: Date | string;
  vendor?: string;
  note?: string;
  receiptUrl?: string;
}

export interface UpdateExpenseDTO extends Partial<CreateExpenseDTO> {}

export interface ExpenseFilterDTO {
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  vendor?: string;
  search?: string;       // searches vendor + note
  page?: string | number;
  limit?: string | number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

class ExpenseService {

  async create(userId: string, payload: CreateExpenseDTO): Promise<IExpense> {
    // Validate categoryId belongs to this user if provided
    if (payload.categoryId) {
      const category = await ExpenseCategory.findOne({ _id: payload.categoryId, userId });
      if (!category) throw new Error('Expense category not found.');
    }

    const expense = new Expense({
      userId,
      ...payload,
      date: payload.date ? new Date(payload.date) : new Date(),
    });

    return expense.save();
  }

  async getAll(userId: string, filters: ExpenseFilterDTO = {}): Promise<PaginatedResult<IExpense>> {
    const query: Record<string, any> = { userId };
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;

    if (filters.categoryId) query.categoryId = filters.categoryId;
    if (filters.vendor) query.vendor = { $regex: filters.vendor, $options: 'i' };

    if (filters.startDate || filters.endDate) {
      query.date = {};
      if (filters.startDate) query.date.$gte = new Date(filters.startDate);
      if (filters.endDate)   query.date.$lte = new Date(filters.endDate);
    }

    if (filters.search) {
      query.$or = [
        { vendor: { $regex: filters.search, $options: 'i' } },
        { note:   { $regex: filters.search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      Expense.find(query)
        .populate('categoryId', 'name')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Expense.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getById(userId: string, expenseId: string): Promise<IExpense> {
    const expense = await Expense.findOne({ _id: expenseId, userId })
      .populate('categoryId', 'name');
    if (!expense) throw new Error('Expense not found.');
    return expense;
  }

  async update(userId: string, expenseId: string, payload: UpdateExpenseDTO): Promise<IExpense> {
    if (payload.categoryId) {
      const category = await ExpenseCategory.findOne({ _id: payload.categoryId, userId });
      if (!category) throw new Error('Expense category not found.');
    }

    const expense = await Expense.findOneAndUpdate(
      { _id: expenseId, userId },
      {
        $set: {
          ...payload,
          ...(payload.date && { date: new Date(payload.date as string) }),
        },
      },
      { new: true, runValidators: true }
    ).populate('categoryId', 'name');

    if (!expense) throw new Error('Expense not found.');
    return expense;
  }

  async delete(userId: string, expenseId: string): Promise<void> {
    const result = await Expense.findOneAndDelete({ _id: expenseId, userId });
    if (!result) throw new Error('Expense not found.');
  }

  // ─── Summary / Analytics ──────────────────────────────────────────────────

  async getSummary(userId: string, startDate?: string, endDate?: string) {
    const matchStage: Record<string, any> = { userId };

    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate)   matchStage.date.$lte = new Date(endDate);
    }

    const [totals, byCategory] = await Promise.all([
      // Total spend
      Expense.aggregate([
        { $match: matchStage },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),

      // Breakdown by category
      Expense.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$categoryId',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'expensecategories',
            localField: '_id',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            categoryName: { $ifNull: ['$category.name', 'Uncategorised'] },
            total: 1,
            count: 1,
          },
        },
        { $sort: { total: -1 } },
      ]),
    ]);

    return {
      total: totals[0]?.total ?? 0,
      count: totals[0]?.count ?? 0,
      byCategory,
    };
  }

}

export default new ExpenseService();
