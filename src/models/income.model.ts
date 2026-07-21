import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'Card' | 'Mobile Money' | 'Cheque' | 'monnify' | 'Other';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IIncome extends Document {
  _id: string;
  userId: string;
  productId?: mongoose.Types.ObjectId;    // ref → Product (optional, can be custom amount)
  unit: number;                           // quantity
  amount: number;                         // total amount received
  customerId?: mongoose.Types.ObjectId;   // ref → Customer (optional)
  paymentMethod: PaymentMethod;
  date: Date;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
  transactionId?: mongoose.Types.ObjectId;
  // ref → Transaction (optional)
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const IncomeSchema = new Schema<IIncome>(
  {
    userId:        { type: String, required: true, index: true },
    productId:     { type: Schema.Types.ObjectId, ref: 'Product' },
    unit:          { type: Number, required: true, min: 1, default: 1 },
    amount:        { type: Number, required: true, min: 0 },
    customerId:    { type: Schema.Types.ObjectId, ref: 'Customer' },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['Cash', 'Bank Transfer', 'Card', 'Mobile Money', 'Cheque','monnify','Other'] satisfies PaymentMethod[],
      default: 'Cash',
    },
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' }, // ref → Transaction (optional)
    date: { type: Date, required: true, default: Date.now },
    note: { type: String, trim: true },
   
  },
  { timestamps: true }
);

IncomeSchema.index({ userId: 1, date: -1 });
IncomeSchema.index({ userId: 1, customerId: 1 });
IncomeSchema.index({ userId: 1, productId: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const Income = mongoose.model<IIncome>('Income', IncomeSchema);