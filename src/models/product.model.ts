import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductType = 'Good' | 'Service';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IProduct extends Document {
  _id: string;
  userId: string;       // owner — the logged-in business user
  name: string;
  type: ProductType;
  price: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const ProductSchema = new Schema<IProduct>(
  {
    userId:      { type: String, required: true, index: true },
    name:        { type: String, required: true, trim: true },
    type:        { type: String, required: true, enum: ['Good', 'Service'] satisfies ProductType[], default: 'Good' },
    price:       { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
  },
  { timestamps: true }
);

ProductSchema.index({ userId: 1, name: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const Product = mongoose.model<IProduct>('Product', ProductSchema);