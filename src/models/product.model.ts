import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductType = 'Good' | 'Service';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IProduct extends Document {
  _id: string;
  userId: string;
  name: string;
  type: ProductType;
  price: number;
  description?: string;
  imageUrl?: string;
  isPublic: boolean;

  // ── Inventory fields (only relevant when type === 'Good') ──────────────────
  trackStock: boolean;           // false for services, true for physical goods
  stock: number;                 // current stock level
  lowStockThreshold: number;     // alert when stock falls at or below this
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
    imageUrl:      { type: String, trim: true },
    isPublic:      { type: Boolean, default: false },
    
    // Inventory
    trackStock:        { type: Boolean, default: false },
    stock:             { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
  },
  { timestamps: true }
);

ProductSchema.index({ userId: 1, name: 1 });
ProductSchema.index({ userId: 1, trackStock: 1, stock: 1 });  // for low stock queries

// ─── Export ───────────────────────────────────────────────────────────────────

export const Product = mongoose.model<IProduct>('Product', ProductSchema);