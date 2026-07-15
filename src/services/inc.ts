// import { Income, IIncome, PaymentMethod } from '../models/income.model';
// import { Product } from '../models/product.model';
// import { Customer } from '../models/customer.model';
// import inventoryService from './inventory.service';

// // ─── DTOs ─────────────────────────────────────────────────────────────────────

// export interface CreateIncomeDTO {
//   productId?: string;
//   unit?: number;
//   amount: number;
//   customerId?: string;
//   paymentMethod?: PaymentMethod;
//   date?: Date | string;
//   note?: string;
//   actorId?: string;      // passed from controller for inventory deduction log
//   actorName?: string;
// }

// export interface UpdateIncomeDTO extends Partial<CreateIncomeDTO> {}

// export interface IncomeFilterDTO {
//   productId?: string;
//   customerId?: string;
//   paymentMethod?: PaymentMethod;
//   startDate?: string;
//   endDate?: string;
//   search?: string;
// }

// // ─── Service ──────────────────────────────────────────────────────────────────

// class IncomeService {

//   async create(userId: string, payload: CreateIncomeDTO): Promise<IIncome & { inventoryWarning?: string }> {
//     if (payload.productId) {
//       const product = await Product.findOne({ _id: payload.productId, userId });
//       if (!product) throw new Error('Product not found.');
//     }

//     if (payload.customerId) {
//       const customer = await Customer.findOne({ _id: payload.customerId, userId });
//       if (!customer) throw new Error('Customer not found.');
//     }

//     const { actorId, actorName, ...incomePayload } = payload;

//     const income = new Income({
//       userId,
//       ...incomePayload,
//       unit:          payload.unit ?? 1,
//       paymentMethod: payload.paymentMethod ?? 'Cash',
//       date:          payload.date ? new Date(payload.date) : new Date(),
//     });

//     await income.save();

//     // ── Auto-deduct stock if product tracks inventory ──────────────────────
//     let inventoryWarning: string | undefined;

//     if (payload.productId && actorId && actorName) {
//       const { isLowStock, stockAfter } = await inventoryService.deductForSale(
//         userId,
//         payload.productId,
//         payload.unit ?? 1,
//         income._id.toString(),
//         actorId,
//         actorName
//       );

//       if (isLowStock) {
//         const product = await Product.findById(payload.productId).select('name');
//         inventoryWarning = stockAfter === 0
//           ? `⚠️ "${product?.name}" is now out of stock.`
//           : `⚠️ "${product?.name}" is running low — only ${stockAfter} left.`;
//       }
//     }

//     return Object.assign(income, { inventoryWarning });
//   }

//   async getAll(userId: string, filters: IncomeFilterDTO = {}): Promise<IIncome[]> {
//     const query: Record<string, any> = { userId };

//     if (filters.productId)     query.productId     = filters.productId;
//     if (filters.customerId)    query.customerId    = filters.customerId;
//     if (filters.paymentMethod) query.paymentMethod = filters.paymentMethod;

//     if (filters.startDate || filters.endDate) {
//       query.date = {};
//       if (filters.startDate) query.date.$gte = new Date(filters.startDate);
//       if (filters.endDate)   query.date.$lte = new Date(filters.endDate);
//     }

//     if (filters.search) {
//       query.$or = [{ note: { $regex: filters.search, $options: 'i' } }];
//     }

//     return Income.find(query)
//       .populate('productId',  'name type price')
//       .populate('customerId', 'name email phone')
//       .sort({ date: -1 });
//   }

//   async getById(userId: string, incomeId: string): Promise<IIncome> {
//     const income = await Income.findOne({ _id: incomeId, userId })
//       .populate('productId',  'name type price')
//       .populate('customerId', 'name email phone');
//     if (!income) throw new Error('Income record not found.');
//     return income;
//   }

//   async update(userId: string, incomeId: string, payload: UpdateIncomeDTO): Promise<IIncome> {
//     if (payload.productId) {
//       const product = await Product.findOne({ _id: payload.productId, userId });
//       if (!product) throw new Error('Product not found.');
//     }

//     if (payload.customerId) {
//       const customer = await Customer.findOne({ _id: payload.customerId, userId });
//       if (!customer) throw new Error('Customer not found.');
//     }

//     const income = await Income.findOneAndUpdate(
//       { _id: incomeId, userId },
//       {
//         $set: {
//           ...payload,
//           ...(payload.date && { date: new Date(payload.date as string) }),
//         },
//       },
//       { new: true, runValidators: true }
//     )
//       .populate('productId',  'name type price')
//       .populate('customerId', 'name email phone');

//     if (!income) throw new Error('Income record not found.');
//     return income;
//   }

//   async delete(userId: string, incomeId: string): Promise<void> {
//     const result = await Income.findOneAndDelete({ _id: incomeId, userId });
//     if (!result) throw new Error('Income record not found.');
//   }

//   async getSummary(userId: string, startDate?: string, endDate?: string) {
//     const matchStage: Record<string, any> = { userId };

//     if (startDate || endDate) {
//       matchStage.date = {};
//       if (startDate) matchStage.date.$gte = new Date(startDate);
//       if (endDate)   matchStage.date.$lte = new Date(endDate);
//     }

//     const [totals, byPaymentMethod, byProduct] = await Promise.all([
//       Income.aggregate([
//         { $match: matchStage },
//         { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
//       ]),
//       Income.aggregate([
//         { $match: matchStage },
//         { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
//         { $sort: { total: -1 } },
//       ]),
//       Income.aggregate([
//         { $match: matchStage },
//         { $group: { _id: '$productId', total: { $sum: '$amount' }, unitsSold: { $sum: '$unit' }, count: { $sum: 1 } } },
//         { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
//         { $unwind: { path: '$product', preserveNullAndEmpty: true } },
//         { $project: { productName: { $ifNull: ['$product.name', 'Custom / No product'] }, total: 1, unitsSold: 1, count: 1 } },
//         { $sort: { total: -1 } },
//       ]),
//     ]);

//     return {
//       total: totals[0]?.total ?? 0,
//       count: totals[0]?.count ?? 0,
//       byPaymentMethod,
//       byProduct,
//     };
//   }

// }

// export default new IncomeService();