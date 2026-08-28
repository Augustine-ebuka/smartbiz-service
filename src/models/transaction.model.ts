import mongoose, { Document, Schema } from 'mongoose';

export interface IRedemption {
    redeemedBy: Schema.Types.ObjectId;
    /** Snapshot of the staff member's name at redemption time — doesn't retroactively change if they rename their account later. */
    redeemedByName: string;
    redeemedAt: Date;
    note?: string | null;
}

export interface ITransaction extends Document {
    _id: Schema.Types.ObjectId;
    user_id: Schema.Types.ObjectId;
    type: "deposit" | "purchase" | "withdrawal";
    status: "pending" | "successful" | "failed"; // fixed: "pending" was duplicated, added "failed"
    amount: number;
    trans_ref: string;
    payment_reference: string;
    checkout_url?: string;
    purchase_info: {
        product_id: Schema.Types.ObjectId;
        quantity: number;
        price: number;
    },
    provider: string;
    data: any
    address: string;
    /** Whether the customer chose delivery at checkout — distinct from `address` merely being present. */
    isDelivery?: boolean;
    /** The delivery fee charged as part of `amount`, for display/reporting — not subtracted from `amount`. */
    deliveryFee?: number;
    products: any[];
    customer_id: Schema.Types.ObjectId;
    /** What this transaction is for — 'catalog' (default) triggers the income/stock flow on webhook; 'subscription' activates a plan instead. */
    purpose?: "catalog" | "subscription";
    /** Extra context for non-catalog purposes, e.g. { planId } for subscription upgrades. */
    metadata?: Record<string, any>;
    /** Set once a business marks this payment as physically redeemed/picked up. Absent (not null) until then, so a $exists check can atomically guard against double redemption. */
    redemption?: IRedemption;

}

const RedemptionSchema = new Schema<IRedemption>(
    {
        redeemedBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
        redeemedByName: { type: String, required: true, trim: true },
        redeemedAt:     { type: Date, required: true },
        note:           { type: String, trim: true, default: null },
    },
    { _id: false }
);

const TransactionSchema: Schema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['deposit', 'purchase'], required: true },
    status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
    amount: { type: Number, required: true },
    trans_ref: { type: String, required: true, unique: true },
    payment_reference: { type: String, required: false },
    checkout_url: { type: String, required: false },
    purchase_info: {
        product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: false },
        quantity: { type: Number, required: false },
        price: { type: Number, required: false },
    },
    provider: { type: String, required: false },
    data: { type: Object, required: false },
    address: { type: String, required: false },
    isDelivery: { type: Boolean, default: false },
    deliveryFee: { type: Number, required: false, min: 0 },
    products: [{ type: Object, required: false }],
    customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: false },
    purpose: { type: String, enum: ['catalog', 'subscription'], default: 'catalog' },
    metadata: { type: Object, required: false },
    // No `default` — stays absent (not null) until redeemed, so the atomic
    // redeem write can use { redemption: { $exists: false } } as its guard.
    redemption: { type: RedemptionSchema },

}, {
    timestamps: true
});

export function generateTransactionRef(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);