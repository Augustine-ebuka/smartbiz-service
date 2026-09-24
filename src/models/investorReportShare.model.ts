import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvestorReportShareStatus = 'active' | 'revoked';

export interface IInvestorReportShare extends Document {
  _id: string;
  ownerId: string;
  tokenHash: string;
  recipientName?: string;
  recipientEmail?: string;
  range: {
    key: string;
    startDate: string;
    endDate: string;
  };
  // Frozen at generation time so the investor always sees the numbers that
  // were actually shared with them, even if the business logs more
  // transactions before the link expires.
  reportSnapshot: Record<string, any>;
  businessSnapshot: {
    businessName: string;
    legalName?: string;
    industry?: string;
    currency: string;
    logoUrl?: string;
  };
  status: InvestorReportShareStatus;
  expiresAt: Date;
  viewCount: number;
  lastViewedAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const InvestorReportShareSchema = new Schema<IInvestorReportShare>(
  {
    ownerId:        { type: String, required: true, index: true },
    tokenHash:      { type: String, required: true, unique: true },
    recipientName:  { type: String, trim: true },
    recipientEmail: { type: String, trim: true, lowercase: true },

    range: {
      key:       { type: String, required: true },
      startDate: { type: String, required: true },
      endDate:   { type: String, required: true },
    },

    reportSnapshot:   { type: Schema.Types.Mixed, required: true },
    businessSnapshot: { type: Schema.Types.Mixed, required: true },

    status:    { type: String, enum: ['active', 'revoked'], default: 'active' },
    expiresAt: { type: Date, required: true },

    viewCount:    { type: Number, default: 0 },
    lastViewedAt: { type: Date },

    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

InvestorReportShareSchema.index({ ownerId: 1, createdAt: -1 });

// MongoDB's TTL monitor physically deletes the document once expiresAt has
// passed (sweeps run roughly every 60s, so this is a cleanup guarantee, not
// the access check itself — getByToken() also checks expiresAt directly so
// expiry is enforced immediately rather than waiting on the sweep).
InvestorReportShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const InvestorReportShare = mongoose.model<IInvestorReportShare>(
  'InvestorReportShare',
  InvestorReportShareSchema
);
