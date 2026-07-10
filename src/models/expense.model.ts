import mongoose, { Document, Schema } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IExpense extends Document {
  _id: string;
  userId: string;
  amount: number;
  categoryId?: mongoose.Types.ObjectId;   // ref → ExpenseCategory
  date: Date;
  vendor?: string;
  note?: string;
  receiptUrl?: string;                    // uploaded receipt/invoice image
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const ExpenseSchema = new Schema<IExpense>(
  {
    userId:     { type: String, required: true, index: true },
    amount:     { type: Number, required: true, min: 0 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory' },
    date:       { type: Date, required: true, default: Date.now },
    vendor:     { type: String, trim: true },
    note:       { type: String, trim: true },
    receiptUrl: { type: String, trim: true },
  },
  { timestamps: true }
);

ExpenseSchema.index({ userId: 1, date: -1 });
ExpenseSchema.index({ userId: 1, categoryId: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const Expense = mongoose.model<IExpense>('Expense', ExpenseSchema);