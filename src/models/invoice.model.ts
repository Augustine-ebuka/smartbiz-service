import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceStatus    = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type RecurringInterval = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type DiscountType     = 'NGN' | 'percentage';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ILineItem {
  description: string;
  quantity:    number;
  unitPrice:   number;
  amount:      number;   // quantity * unitPrice (computed but stored for snapshot)
  productId?:  string;   // optional — if picked from catalog
}

export interface IRecurring {
  enabled:       boolean;
  interval:      RecurringInterval;
  nextIssueDate: Date;
  endDate?:      Date;        // null = runs forever
  occurrences:   number;      // how many times it has recurred so far
}

export interface IInvoice extends Document {
  _id:          string;
  invoiceNumber: string;      // e.g. "INV-00042"
  userId:       string;       // business owner
  sourceTransactionId?: string; // ref → Transaction, if generated from an existing sale

  // ── Customer info ──────────────────────────────────────────────────────────
  customerId?:      string;   // ref → Customer (if picked from catalog)
  customerName:     string;
  customerEmail?:   string;
  customerPhone?:   string;
  customerAddress?: string;

  // ── Dates ──────────────────────────────────────────────────────────────────
  issueDate: Date;
  dueDate:   Date;
  paidAt?:   Date;

  // ── Line items ─────────────────────────────────────────────────────────────
  lineItems: ILineItem[];

  // ── Totals ─────────────────────────────────────────────────────────────────
  subtotal:     number;
  taxPercent:   number;        // e.g. 7.5
  taxAmount:    number;        // computed
  discountType: DiscountType;
  discountValue: number;       // amount or percentage
  discountAmount: number;      // computed
  total:        number;        // subtotal + tax - discount
  currency:     string;        // e.g. "NGN"

  // ── Meta ───────────────────────────────────────────────────────────────────
  notes?:      string;
  status:      InvoiceStatus;
  recurring?:  IRecurring;
  createdAt:   Date;
  updatedAt:   Date;
}

// ─── Sub-Schemas ──────────────────────────────────────────────────────────────

const LineItemSchema = new Schema<ILineItem>(
  {
    description: { type: String, required: true, trim: true },
    quantity:    { type: Number, required: true, min: 0, default: 1 },
    unitPrice:   { type: Number, required: true, min: 0, default: 0 },
    amount:      { type: Number, required: true, default: 0 },
    productId:   { type: String },
  },
  { _id: true }
);

const RecurringSchema = new Schema<IRecurring>(
  {
    enabled:       { type: Boolean, default: false },
    interval:      { type: String, enum: ['weekly', 'monthly', 'quarterly', 'yearly'] },
    nextIssueDate: { type: Date },
    endDate:       { type: Date },
    occurrences:   { type: Number, default: 0 },
  },
  { _id: false }
);

// ─── Invoice Schema ───────────────────────────────────────────────────────────

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber:   { type: String },
    userId:          { type: String, required: true, index: true },
    sourceTransactionId: { type: String, index: true },

    customerId:      { type: String },
    customerName:    { type: String, required: true, trim: true },
    customerEmail:   { type: String, trim: true, lowercase: true },
    customerPhone:   { type: String, trim: true },
    customerAddress: { type: String, trim: true },

    issueDate: { type: Date, required: true, default: Date.now },
    dueDate:   { type: Date, required: true },
    paidAt:    { type: Date },

    lineItems: { type: [LineItemSchema], required: true },

    subtotal:       { type: Number, required: true, default: 0 },
    taxPercent:     { type: Number, default: 0 },
    taxAmount:      { type: Number, default: 0 },
    discountType:   { type: String, enum: ['NGN', 'percentage'], default: 'NGN' },
    discountValue:  { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    total:          { type: Number, required: true, default: 0 },
    currency:       { type: String, default: 'NGN' },

    notes:    { type: String, trim: true },
    status:   { type: String, enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'], default: 'draft' },
    recurring: { type: RecurringSchema },
  },
  { timestamps: true }
);

// ─── Auto-generate invoice number ─────────────────────────────────────────────

InvoiceSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    const count        = await mongoose.model('Invoice').countDocuments({ userId: this.userId });
    this.invoiceNumber = `INV-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// invoiceNumber is only generated to be unique *within* a business (see the
// pre-save hook above) — the constraint has to match that scope, or two
// different users whose Nth invoice lands on the same number will collide.
InvoiceSchema.index({ userId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ userId: 1, status: 1 });
InvoiceSchema.index({ userId: 1, dueDate: 1 });
InvoiceSchema.index({ userId: 1, customerId: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const Invoice = mongoose.model<IInvoice>('Invoice', InvoiceSchema);
