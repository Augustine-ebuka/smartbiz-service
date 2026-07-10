import { Customer, ICustomer } from '../models/customer.model';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateCustomerDTO {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export type UpdateCustomerDTO = Partial<CreateCustomerDTO>;

// ─── Service ──────────────────────────────────────────────────────────────────

class CustomerService {

  async create(userId: string, payload: CreateCustomerDTO): Promise<ICustomer> {
    const customer = new Customer({ userId, ...payload });
    return customer.save();
  }

  async getAll(userId: string): Promise<ICustomer[]> {
    return Customer.find({ userId }).sort({ createdAt: -1 });
  }

  async getById(userId: string, customerId: string): Promise<ICustomer> {
    const customer = await Customer.findOne({ _id: customerId, userId });
    if (!customer) throw new Error('Customer not found.');
    return customer;
  }

  async update(userId: string, customerId: string, payload: UpdateCustomerDTO): Promise<ICustomer> {
    const customer = await Customer.findOneAndUpdate(
      { _id: customerId, userId },
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!customer) throw new Error('Customer not found.');
    return customer;
  }

  async delete(userId: string, customerId: string): Promise<void> {
    const result = await Customer.findOneAndDelete({ _id: customerId, userId });
    if (!result) throw new Error('Customer not found.');
  }

}

export default new CustomerService();