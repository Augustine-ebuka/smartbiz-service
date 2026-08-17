import mongoose from 'mongoose';

export type InvoiceClaimStatus = 'pending' | 'submitted' | 'paid' | 'revoked' | 'expired';

export interface IInvoiceClaim extends mongoose.Document {
  invoiceId: mongoose.Types.ObjectId;
  tokenHash: string;
  salt?: string | null;
  expiresAt: Date;
  maxUses: number;
  uses: number;
  status: InvoiceClaimStatus;
  proofUrl?: string | null;
  claimantName?: string | null;
  claimantEmail?: string | null;
  metadata?: any;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceClaimSchema = new mongoose.Schema<IInvoiceClaim>({
  invoiceId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Invoice' },
  tokenHash: { type: String, required: true, index: true },
  salt: { type: String, required: false },
  expiresAt: { type: Date, required: true },
  maxUses: { type: Number, required: true, default: 1 },
  uses: { type: Number, required: true, default: 0 },
  status: { type: String, required: true, default: 'pending' },
  proofUrl: { type: String },
  claimantName: { type: String },
  claimantEmail: { type: String },
  metadata: { type: Object },
  createdBy: { type: String },
}, { timestamps: true });

export const InvoiceClaim = mongoose.model<IInvoiceClaim>('InvoiceClaim', InvoiceClaimSchema);

export default InvoiceClaim;
