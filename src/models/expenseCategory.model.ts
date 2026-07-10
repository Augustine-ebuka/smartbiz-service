import mongoose, { Document, Schema } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IExpenseCategory extends Document {
  _id: string;
  userId: string;       // owner — the logged-in business user
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const ExpenseCategorySchema = new Schema<IExpenseCategory>(
  {
    userId: { type: String, required: true, index: true },
    name:   { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// A user cannot have two categories with the same name
ExpenseCategorySchema.index({ userId: 1, name: 1 }, { unique: true });

// ─── Export ───────────────────────────────────────────────────────────────────

export const ExpenseCategory = mongoose.model<IExpenseCategory>('ExpenseCategory', ExpenseCategorySchema);