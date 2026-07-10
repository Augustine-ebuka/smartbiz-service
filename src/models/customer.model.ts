import mongoose, { Document, Schema } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ICustomer extends Document {
  _id: string;
  userId: string;       // owner — the logged-in business user
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const CustomerSchema = new Schema<ICustomer>(
  {
    userId:  { type: String, required: true, index: true },
    name:    { type: String, required: true, trim: true },
    email:   { type: String, trim: true, lowercase: true },
    phone:   { type: String, trim: true },
    address: { type: String, trim: true },
    notes:   { type: String, trim: true },
  },
  { timestamps: true }
);

CustomerSchema.index({ userId: 1, name: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const Customer = mongoose.model<ICustomer>('Customer', CustomerSchema);