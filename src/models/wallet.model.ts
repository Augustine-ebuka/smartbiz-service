import mongoose, { Document, Schema, model } from 'mongoose';
import bcrypt from 'bcrypt';
import { IUser } from './user.model';
// Interface to define our User model
export interface IWallet extends Document {
    _id: Schema.Types.ObjectId;
    user_id: Schema.Types.ObjectId | IUser;
    balance: number; //in kobo
    currency: string; //default is naira
}

// Create the schema
const WalletSchema: Schema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'NGN' },

}, {
  timestamps: true
});

// function to convert balance from kobo to naira
export function convertKoboToNaira(kobo: number): number {
    return kobo / 100;
}

// Create and export the model
export const Wallet = mongoose.model<IWallet>('Wallet', WalletSchema);