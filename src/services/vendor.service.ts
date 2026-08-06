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

export const createVendor = (input: CreateVendorInput) => VendorModel.create(input);

export const listVendors = (filters: VendorFilters = {}) => {
  const query: FilterQuery<VendorDocument> = {};
  if (filters.category) query.category = filters.category;
  if (filters.name) query.name = new RegExp(filters.name, 'i');

  return VendorModel.find(query).sort({ name: 1 });
};

export const getVendorById = async (id: string): Promise<VendorDocument> => {
  const vendor = await VendorModel.findById(id);
  if (!vendor) throw new NotFoundError('Vendor not found');
  return vendor;
};

export const updateVendor = async (
  id: string,
  updates: UpdateVendorInput,
): Promise<VendorDocument> => {
  const vendor = await VendorModel.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!vendor) throw new NotFoundError('Vendor not found');
  return vendor;
};

export const deleteVendor = async (id: string): Promise<void> => {
  const vendor = await VendorModel.findByIdAndDelete(id);
  if (!vendor) throw new NotFoundError('Vendor not found');
};
