import mongoose, { Document, Schema } from 'mongoose';
import { IBankingDetails, PayFrequency } from './user.model';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PayrollRunStatus = 'draft' | 'completed' | 'cancelled';
export type PayslipStatus    = 'pending' | 'paid';

// ─── Payslip (embedded) ─────────────────────────────────────────────────────

export interface IPayslip {
  _id:            mongoose.Types.ObjectId;
  employeeId:     string;        // ref → User
  employeeName:   string;        // snapshot
  employeeCode?:  string;        // snapshot of employeeProfile.employeeCode
  jobTitle?:      string;        // snapshot
  bankDetails?:   IBankingDetails; // snapshot — for issuing the actual transfer
  payFrequency:   PayFrequency;  // snapshot — needed to annualize for PAYE
  baseSalary:     number;
  allowances:     number;        // flat addition, e.g. transport/housing
  grossPay:       number;        // baseSalary + allowances

  // Statutory deductions — computed automatically from the business's
  // payroll preferences at the time this payslip was (re)computed.
  payeDeduction:      number;
  pensionDeduction:   number;
  nhfDeduction:        number;
  otherDeductions:     number;   // manual, e.g. loan repayment
  totalDeductions:     number;   // sum of the four above

  netPay:         number;        // grossPay - totalDeductions
  status:         PayslipStatus;
  paidAt?:        Date;
  paymentReference?: string;
  expenseId?:     string;        // ref → Expense, created when marked paid
}

// ─── Payroll Run ──────────────────────────────────────────────────────────────

export interface IPayrollRun extends Document {
  _id:          string;
  runNumber:    string;          // e.g. "PR-00001"
  userId:       string;          // business owner
  periodLabel:  string;          // e.g. "August 2026"
  periodStart:  Date;
  periodEnd:    Date;
  status:       PayrollRunStatus;
  payslips:     IPayslip[];
  totalGross:   number;
  totalDeductions: number;
  totalNet:     number;
  createdBy:    string;          // actorId who created the run
  completedAt?: Date;
  createdAt:    Date;
  updatedAt:    Date;
}

// ─── Sub-Schema ───────────────────────────────────────────────────────────────

const BankDetailsSnapshotSchema = new Schema<IBankingDetails>(
  {
    bankName:       { type: String, trim: true },
    accountName:    { type: String, trim: true },
    accountNumber:  { type: String, trim: true },
    routingOrSwift: { type: String, trim: true },
  },
  { _id: false }
);

const PayslipSchema = new Schema<IPayslip>(
  {
    employeeId:   { type: String, required: true },
    employeeName: { type: String, required: true },
    employeeCode: { type: String },
    jobTitle:     { type: String },
    bankDetails:  { type: BankDetailsSnapshotSchema },
    payFrequency: { type: String, enum: ['weekly', 'biweekly', 'monthly'], required: true },
    baseSalary:   { type: Number, required: true, min: 0 },
    allowances:   { type: Number, default: 0, min: 0 },
    grossPay:     { type: Number, required: true, min: 0 },

    payeDeduction:    { type: Number, default: 0, min: 0 },
    pensionDeduction: { type: Number, default: 0, min: 0 },
    nhfDeduction:      { type: Number, default: 0, min: 0 },
    otherDeductions:   { type: Number, default: 0, min: 0 },
    totalDeductions:   { type: Number, default: 0, min: 0 },

    netPay:       { type: Number, required: true, min: 0 },
    status:       { type: String, enum: ['pending', 'paid'], default: 'pending' },
    paidAt:       { type: Date },
    paymentReference: { type: String, trim: true },
    expenseId:    { type: String },
  },
  { _id: true }
);

// ─── Schema ───────────────────────────────────────────────────────────────────

const PayrollRunSchema = new Schema<IPayrollRun>(
  {
    runNumber:    { type: String, unique: true },
    userId:       { type: String, required: true, index: true },
    periodLabel:  { type: String, required: true, trim: true },
    periodStart:  { type: Date, required: true },
    periodEnd:    { type: Date, required: true },
    status:       { type: String, enum: ['draft', 'completed', 'cancelled'], default: 'draft' },
    payslips:     { type: [PayslipSchema], default: [] },
    totalGross:      { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    totalNet:        { type: Number, default: 0 },
    createdBy:    { type: String, required: true },
    completedAt:  { type: Date },
  },
  { timestamps: true }
);

// ─── Auto-generate human readable run number ──────────────────────────────────

PayrollRunSchema.pre('save', async function (next) {
  if (!this.runNumber) {
    const count = await mongoose.model('PayrollRun').countDocuments();
    this.runNumber = `PR-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

PayrollRunSchema.index({ userId: 1, status: 1 });
PayrollRunSchema.index({ userId: 1, createdAt: -1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const PayrollRun = mongoose.model<IPayrollRun>('PayrollRun', PayrollRunSchema);
