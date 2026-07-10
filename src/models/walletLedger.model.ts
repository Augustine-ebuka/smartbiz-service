import mongoose, { Document, Schema } from 'mongoose';

export interface IWalletLedger extends Document {
    wallet_id: mongoose.Types.ObjectId;
    type: 'credit' | 'debit';
    amount: number;
    balance_before: number;
    balance_after: number;
    reference: string;
    description: string;
    created_at: Date;
}

const WalletLedgerSchema: Schema = new Schema({
    wallet_id: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true },
    balance_before: { type: Number, required: true },
    balance_after: { type: Number, required: true },
    reference: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: false }
});

export const WalletLedger = mongoose.model<IWalletLedger>('WalletLedger', WalletLedgerSchema);
