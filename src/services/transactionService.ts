import {User, IUser} from '../models/user.model';
import {Wallet, IWallet} from '../models/wallet.model';
import ApiError from "../utils/ApiError";
import {Transaction, ITransaction} from '../models/transaction.model';

interface GetAllTransactionsOptions {
    page?: number;
    limit?: number;
    status?: "pending" | "successful" | "failed";
    type?: "deposit" | "purchase";
    user_id?: string;
}

class TransactionService {
    async createTransaction(transaction: ITransaction) {
        return await Transaction.create(transaction);
    }

    async getTransactionByRef(trans_ref: string) {
        return await Transaction.findOne({ trans_ref });
    }

    async getAll(options: GetAllTransactionsOptions = {}) {
        const {
            page = 1,
            limit = 10,
            status,
            type,
            user_id,
        } = options;

        const filter: Record<string, any> = {};

        if (status) filter.status = status;
        if (type) filter.type = type;
        if (user_id) filter.user_id = user_id;

        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
            Transaction.find(filter)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            Transaction.countDocuments(filter),
        ]);

        return {
            data: transactions,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1,
            },
        };
    }
}

export default new TransactionService();