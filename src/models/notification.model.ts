import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType = 'low_stock' | 'debt_due' | 'invoice_due' | 'new_sale';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface INotification extends Document {
  _id: string;
  userId: string;              // business owner this belongs to
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  resourceType: 'product' | 'debt' | 'invoice' | 'transaction';
  resourceId: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const NotificationSchema = new Schema<INotification>(
  {
    userId:       { type: String, required: true, index: true },
    type:         { type: String, required: true, enum: ['low_stock', 'debt_due', 'invoice_due', 'new_sale'] },
    severity:     { type: String, required: true, enum: ['info', 'warning', 'critical'], default: 'info' },
    title:        { type: String, required: true, trim: true },
    message:      { type: String, required: true, trim: true },
    resourceType: { type: String, required: true, enum: ['product', 'debt', 'invoice', 'transaction'] },
    resourceId:   { type: String, required: true },
    read:         { type: Boolean, default: false },
    readAt:       { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }   // notifications are immutable except for read/readAt
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, type: 1, resourceId: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
