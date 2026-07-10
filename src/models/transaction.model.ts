import mongoose, { Document, Schema } from 'mongoose';

export interface ITransaction extends Document {
    _id: Schema.Types.ObjectId;
    user_id: Schema.Types.ObjectId;
    type: "deposit" | "purchase" | "withdrawal";
    status: "pending" | "successful" | "failed"; // fixed: "pending" was duplicated, added "failed"
    amount: number;
    trans_ref: string;
    purchase_info: {
        product_id: Schema.Types.ObjectId;
        quantity: number;
        price: number;
    },
    provider: string;
    data: any
}

const TransactionSchema: Schema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['deposit', 'purchase'], required: true },
    status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
    amount: { type: Number, required: true },
    trans_ref: { type: String, required: true, unique: true },
    purchase_info: {
        product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: false },
        quantity: { type: Number, required: false },
        price: { type: Number, required: false },
    },
    provider: { type: String, required: false },
    data: { type: Object, required: false },
}, {
    timestamps: true
});

export function generateTransactionRef(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);