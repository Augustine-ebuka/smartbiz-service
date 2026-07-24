import mongoose, { Document, model, Schema } from 'mongoose';

export const DEBT_TYPES = ['THEY_OWE_ME', 'I_OWE_THEM'] as const;
export type DebtType = (typeof DEBT_TYPES)[number];

export interface DebtRecordDocument extends Document {
  type: DebtType;
  amount: number;
  customer: mongoose.Types.ObjectId;  
  dueDate?: Date;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  userId: string;
}

const debtRecordSchema = new Schema<DebtRecordDocument>(
  {
    type: { type: String, enum: DEBT_TYPES, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    dueDate: { type: Date },
    description: { type: String, trim: true },
    status: { type: String, enum: ['PENDING', 'PAID'], default: 'PENDING' },
    userId: { type: String, required: true },
  },
  { timestamps: true },
);

export const DebtRecordModel = model<DebtRecordDocument>('DebtRecord', debtRecordSchema);