import { Schema, model, Document } from 'mongoose';

export interface VendorBankDetails {
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
}

export interface VendorDocument extends Document {
  userId: string;       // business owner this vendor belongs to
  name: string;
  contactPerson?: string;
  category?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  paymentTerms?: string;
  bankDetails?: VendorBankDetails;
  website?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const bankDetailsSchema = new Schema<VendorBankDetails>(
  {
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    accountName: { type: String, trim: true },
  },
  { _id: false },
);

const vendorSchema = new Schema<VendorDocument>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    category: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    taxId: { type: String, trim: true },
    paymentTerms: { type: String, trim: true },
    bankDetails: bankDetailsSchema,
    website: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

export const VendorModel = model<VendorDocument>('Vendor', vendorSchema);
