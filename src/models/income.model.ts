import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'Card' | 'Mobile Money' | 'Cheque' | 'monnify' | 'Other';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IIncome extends Document {
  _id: string;
  receiptId: string;                      // auto-generated e.g. "RCT-00001"
  userId: string;
  productId?: mongoose.Types.ObjectId;    // ref → Product (optional, can be custom amount)
  unit: number;                           // quantity
  amount: number;                         // total amount received
  costAmount: number;                     // cost of goods sold, for profit = amount - costAmount
  customerId?: mongoose.Types.ObjectId;   // ref → Customer (optional)
  paymentMethod: PaymentMethod;
  date: Date;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
  transactionId?: mongoose.Types.ObjectId;
  vat: boolean;
  returned: boolean;
  discountAmount: number;
  vatAmount: number;
  // ref → Transaction (optional)
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const IncomeSchema = new Schema<IIncome>(
  {
    receiptId:     { type: String, unique: true },
    userId:        { type: String, required: true, index: true },
    productId:     { type: Schema.Types.ObjectId, ref: 'Product' },
    unit:          { type: Number, required: true, min: 1, default: 1 },
    amount:        { type: Number, required: true, min: 0 },
    costAmount:    { type: Number, default: 0, min: 0 },
    customerId:    { type: Schema.Types.ObjectId, ref: 'Customer' },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['Cash', 'Bank Transfer', 'Card', 'Mobile Money', 'Cheque','monnify','Other'] satisfies PaymentMethod[],
      default: 'Cash',
    },
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' }, // ref → Transaction (optional)
    date: { type: Date, required: true, default: Date.now },
    vat:      { type: Boolean, default: false },
    returned: { type: Boolean, default: false },
    discountAmount: { type: Number, default: 0, min: 0 },
    vatAmount: { type: Number, default: 0, min: 0 },
    note: { type: String, trim: true },
   
  },
  { timestamps: true }
);

// ─── Auto-generate human readable receipt ID ──────────────────────────────────
// Scoped per business (like invoiceNumber) so each business's receipts start at 00001.

IncomeSchema.pre('save', async function (next) {
  if (!this.receiptId) {
    const count = await mongoose.model('Income').countDocuments({ userId: this.userId });
    this.receiptId = `RCT-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

IncomeSchema.index({ userId: 1, date: -1 });
IncomeSchema.index({ userId: 1, customerId: 1 });
IncomeSchema.index({ userId: 1, productId: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const Income = mongoose.model<IIncome>('Income', IncomeSchema);