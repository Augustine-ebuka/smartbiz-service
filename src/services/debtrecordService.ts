import { FilterQuery } from 'mongoose';
import { NotFoundError } from '../config/Apperror';
import { DebtRecordModel, DebtRecordDocument, DebtType } from "../models/debtrecord";

export interface CreateDebtRecordInput {
  type: DebtType;
  amount: number;
  customer: string;
  dueDate?: Date;
  description?: string;
  userId?: string;
}

export type UpdateDebtRecordInput = Partial<CreateDebtRecordInput>;

export interface DebtRecordFilters {
  type?: DebtType;
  /** Case-insensitive partial match on customer name */
  customer?: string;
}

export const createDebtRecord = (input: CreateDebtRecordInput) => DebtRecordModel.create(input);

export const listDebtRecords = (filters: DebtRecordFilters = {}) => {
  const query: FilterQuery<DebtRecordDocument> = {};
  if (filters.type) query.type = filters.type;
  if (filters.customer) query.customer = new RegExp(filters.customer, 'i');

  return DebtRecordModel.find(query).sort({ createdAt: -1 });
};

export const getDebtRecordById = async (id: string): Promise<DebtRecordDocument> => {
  const record = await DebtRecordModel.findById(id);
  if (!record) throw new NotFoundError('Debt record not found');
  return record;
};

export const updateDebtRecord = async (
  id: string,
  updates: UpdateDebtRecordInput,
): Promise<DebtRecordDocument> => {
  const record = await DebtRecordModel.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!record) throw new NotFoundError('Debt record not found');
  return record;
};

export const deleteDebtRecord = async (id: string): Promise<void> => {
  const record = await DebtRecordModel.findByIdAndDelete(id);
  if (!record) throw new NotFoundError('Debt record not found');
};

export const markDebtRecordAsPaid = async (id: string, userId: string): Promise<void> => {
  const record = await DebtRecordModel.findByIdAndUpdate(id, { status: 'PAID', userId }, {
    new: true,
    runValidators: true,
  });
  if (!record) throw new NotFoundError('Debt record not found');
};
