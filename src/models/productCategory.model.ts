import mongoose, { Document, Schema } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IProductCategory extends Document {
  _id: string;
  userId?: string;     // absent for built-in/system categories, shared by every business
  name: string;
  system: boolean;     // true = built-in, seeded category — not user-owned, can't be edited/deleted
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const ProductCategorySchema = new Schema<IProductCategory>(
  {
    userId: { type: String, index: true },
    name:   { type: String, required: true, trim: true },
    system: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// A user cannot have two categories with the same name. System categories
// share no userId, so they're likewise protected from name collisions with
// each other by this same index.
ProductCategorySchema.index({ userId: 1, name: 1 }, { unique: true });

// ─── Export ───────────────────────────────────────────────────────────────────

export const ProductCategory = mongoose.model<IProductCategory>('ProductCategory', ProductCategorySchema);
