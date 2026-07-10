import mongoose, { Document, Schema } from "mongoose";

/**
 * Fee Type Interface
 */
export interface IFee {
  kind: "percentage" | "flat" | "spread";
  value: number;
}

/**
 * Main Config Interface
 */
export interface IFeeConfig extends Document {
  id?: string;

  company: string;
  notes?: string;

  fiatDeposit: boolean;
  fiatDepositFee: IFee;

  cryptoDeposit: boolean;
  cryptoDepositFee: IFee;

  ngnWithdrawal: boolean;
  ngnWithdrawalFee: IFee;

  p2pTransfer: boolean;
  p2pTransferFee: IFee;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reusable Fee Schema
 */
const FeeSchema = new Schema<IFee>(
  {
    kind: {
      type: String,
      enum: ["percentage", "flat", "spread"],
      required: true,
    },
    value: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

/**
 * Main Schema
 */
const FeeConfigSchema = new Schema<IFeeConfig>(
  {
    id: { type: String },

    company: { type: String, required: true },
    notes: { type: String },

    fiatDeposit: { type: Boolean, default: false },
    fiatDepositFee: { type: FeeSchema, required: true },

    cryptoDeposit: { type: Boolean, default: false },
    cryptoDepositFee: { type: FeeSchema, required: true },

    ngnWithdrawal: { type: Boolean, default: false },
    ngnWithdrawalFee: { type: FeeSchema, required: true },

    p2pTransfer: { type: Boolean, default: false },
    p2pTransferFee: { type: FeeSchema, required: true },
  },
  {
    timestamps: true,
  }
);

export const FeeConfig = mongoose.model<IFeeConfig>(
  "FeeConfig",
  FeeConfigSchema
);