import { FilterQuery } from 'mongoose';
import { NotFoundError } from '../config/Apperror';
import { VendorBankDetails, VendorDocument, VendorModel } from '../models/vendor.model';

export interface CreateVendorInput {
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
}

export type UpdateVendorInput = Partial<CreateVendorInput>;

export interface VendorFilters {
  category?: string;
  /** Case-insensitive partial match on vendor/business name */
  name?: string;
}

export const createVendor = (userId: string, input: CreateVendorInput) =>
  VendorModel.create({ userId, ...input });

export const listVendors = (userId: string, filters: VendorFilters = {}) => {
  const query: FilterQuery<VendorDocument> = { userId };
  if (filters.category) query.category = filters.category;
  if (filters.name) query.name = new RegExp(filters.name, 'i');

  return VendorModel.find(query).sort({ name: 1 });
};

export const getVendorById = async (userId: string, id: string): Promise<VendorDocument> => {
  const vendor = await VendorModel.findOne({ _id: id, userId });
  if (!vendor) throw new NotFoundError('Vendor not found');
  return vendor;
};

export const updateVendor = async (
  userId: string,
  id: string,
  updates: UpdateVendorInput,
): Promise<VendorDocument> => {
  const vendor = await VendorModel.findOneAndUpdate({ _id: id, userId }, updates, {
    new: true,
    runValidators: true,
  });
  if (!vendor) throw new NotFoundError('Vendor not found');
  return vendor;
};

export const deleteVendor = async (userId: string, id: string): Promise<void> => {
  const vendor = await VendorModel.findOneAndDelete({ _id: id, userId });
  if (!vendor) throw new NotFoundError('Vendor not found');
};
