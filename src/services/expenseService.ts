import { ExpenseCategory, IExpenseCategory } from '../models/expenseCategory.model';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateExpenseCategoryDTO {
  name: string;
}

export type UpdateExpenseCategoryDTO = Partial<CreateExpenseCategoryDTO>;

// ─── Service ──────────────────────────────────────────────────────────────────

class ExpenseCategoryService {

  async create(userId: string, payload: CreateExpenseCategoryDTO): Promise<IExpenseCategory> {
    const existing = await ExpenseCategory.findOne({
      userId,
      name: { $regex: new RegExp(`^${payload.name}$`, 'i') },   // case-insensitive dupe check
    });
    if (existing) throw new Error(`Category "${payload.name}" already exists.`);

    const category = new ExpenseCategory({ userId, ...payload });
    return category.save();
  }

  async getAll(userId: string): Promise<IExpenseCategory[]> {
    return ExpenseCategory.find({ userId }).sort({ name: 1 });
  }

  async getById(userId: string, categoryId: string): Promise<IExpenseCategory> {
    const category = await ExpenseCategory.findOne({ _id: categoryId, userId });
    if (!category) throw new Error('Expense category not found.');
    return category;
  }

  async update(userId: string, categoryId: string, payload: UpdateExpenseCategoryDTO): Promise<IExpenseCategory> {
    if (payload.name) {
      const existing = await ExpenseCategory.findOne({
        userId,
        name: { $regex: new RegExp(`^${payload.name}$`, 'i') },
        _id: { $ne: categoryId },
      });
      if (existing) throw new Error(`Category "${payload.name}" already exists.`);
    }

    const category = await ExpenseCategory.findOneAndUpdate(
      { _id: categoryId, userId },
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!category) throw new Error('Expense category not found.');
    return category;
  }

  async delete(userId: string, categoryId: string): Promise<void> {
    const result = await ExpenseCategory.findOneAndDelete({ _id: categoryId, userId });
    if (!result) throw new Error('Expense category not found.');
  }

}

export default new ExpenseCategoryService();