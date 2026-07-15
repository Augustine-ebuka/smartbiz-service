import mongoose, { Document, Schema } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockMovementType =
  | 'sale'          // auto-deducted when income is logged
  | 'restock'       // manual stock-in (owner adds new stock)
  | 'adjustment'    // manual correction (e.g. stock count discrepancy)
  | 'return'        // customer returned item, stock added back
  | 'damage'        // damaged/lost goods removed from stock
  | 'initial';      // first time stock is set on a product

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IStockHistory extends Document {
  _id: string;
  userId: string;           // business owner
  productId: string;
  productName: string;      // snapshot at time of movement
  movementType: StockMovementType;
  quantity: number;         // always positive — direction determined by movementType
  direction: 'in' | 'out'; // in = stock added, out = stock removed
  stockBefore: number;      // stock level before this movement
  stockAfter: number;       // stock level after this movement
  referenceId?: string;     // incomeId for 'sale', etc.
  note?: string;
  actorId: string;          // who made the change
  actorName: string;
  createdAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const StockHistorySchema = new Schema<IStockHistory>(
  {
    userId:       { type: String, required: true, index: true },
    productId:    { type: String, required: true, index: true },
    productName:  { type: String, required: true },
    movementType: { type: String, required: true, enum: ['sale', 'restock', 'adjustment', 'return', 'damage', 'initial'] },
    quantity:     { type: Number, required: true, min: 1 },
    direction:    { type: String, required: true, enum: ['in', 'out'] },
    stockBefore:  { type: Number, required: true },
    stockAfter:   { type: Number, required: true },
    referenceId:  { type: String },
    note:         { type: String, trim: true },
    actorId:      { type: String, required: true },
    actorName:    { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },  // immutable logs
  }
);

StockHistorySchema.index({ userId: 1, productId: 1, createdAt: -1 });
StockHistorySchema.index({ userId: 1, createdAt: -1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const StockHistory = mongoose.model<IStockHistory>('StockHistory', StockHistorySchema);
