import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityAction =
  | 'income.create'
  | 'income.update'
  | 'income.delete'
  | 'expense.create'
  | 'expense.update'
  | 'expense.delete'
  | 'customer.create'
  | 'customer.update'
  | 'customer.delete'
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'expense_category.create'
  | 'expense_category.update'
  | 'expense_category.delete'
  | 'saleskeeper.invite'
  | 'saleskeeper.revoke'
  | 'saleskeeper.reinstate'
  | 'saleskeeper.permissions_updated';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IActivityLog extends Document {
  _id: string;
  businessOwnerId: string;    // the business this log belongs to
  actorId: string;            // who performed the action (owner or saleskeeper)
  actorName: string;          // snapshot of their name at time of action
  actorRole: string;          // 'business_owner' | 'staff' etc.
  action: ActivityAction;
  resourceId?: string;        // the _id of the created/updated/deleted document
  description: string;        // human-readable e.g. "Logged income of ₦5,000 from Laundry"
  amount?: number;            // for income/expense actions
  metadata?: Record<string, any>;  // any extra context
  createdAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    businessOwnerId: { type: String, required: true, index: true },
    actorId:         { type: String, required: true },
    actorName:       { type: String, required: true },
    actorRole:       { type: String, required: true },
    action:          { type: String, required: true },
    resourceId:      { type: String },
    description:     { type: String, required: true },
    amount:          { type: Number },
    metadata:        { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },  // logs are immutable
  }
);

ActivityLogSchema.index({ businessOwnerId: 1, createdAt: -1 });
ActivityLogSchema.index({ businessOwnerId: 1, actorId: 1 });
ActivityLogSchema.index({ businessOwnerId: 1, action: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const ActivityLog = mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);