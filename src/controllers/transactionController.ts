import { Request, Response, NextFunction } from 'express';
import TransactionService from '../services/transactionService';
import ApiError from '../utils/ApiError';
import { generateTransactionRef } from '../models/transaction.model';
import { breakPoint } from '../config/config';
import { Transaction } from '../models/transaction.model';
import walletService from '../services/walletService';

class TransactionController {

    async createTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { type, amount, purchase_info } = req.body;
            const user_id = req.userId; 

            const transaction = await TransactionService.createTransaction({
                user_id,
                type,
                amount,
                status: 'pending',
                trans_ref: generateTransactionRef(),
                purchase_info,
            } as any);

            res.status(201).json({
                success: true,
                message: 'Transaction created successfully',
                data: transaction,
            });
        } catch (error) {
            next(error);
        }
    }

    async getTransactionByRef(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { trans_ref } = req.params;

            const transaction = await TransactionService.getTransactionByRef(trans_ref);

            if (!transaction) {
                throw new ApiError(404, 'Transaction not found');
            }

            res.status(200).json({
                success: true,
                message: 'Transaction retrieved successfully',
                data: transaction,
            });
        } catch (error) {
            next(error);
        }
    }

    async getAllTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { page, limit, status, type, user_id } = req.query;

            const result = await TransactionService.getAll({
                page: page ? parseInt(page as string) : undefined,
                limit: limit ? parseInt(limit as string) : undefined,
                status: status as "pending" | "successful" | "failed" | undefined,
                type: type as "deposit" | "purchase" | undefined,
                user_id: user_id as string | undefined,
            });

            res.status(200).json({
                success: true,
                message: 'Transactions retrieved successfully',
                data: result.data,
                meta: result.meta,
            });
        } catch (error) {
            next(error);
        }
    }

    async getUserTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.userId; 
            const { page, limit, status, type } = req.query;

            const result = await TransactionService.getAll({
                user_id: user_id.toString(),
                page: page ? parseInt(page as string) : undefined,
                limit: limit ? parseInt(limit as string) : undefined,
                status: status as "pending" | "successful" | "failed" | undefined,
                type: type as "deposit" | "purchase" | undefined,
            });

            res.status(200).json({
                success: true,
                message: 'User transactions retrieved successfully',
                data: result.data,
                meta: result.meta,
            });
        } catch (error) {
            next(error);
        }
    }
    async paystackWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const { event, data } = req.body;

        // Acknowledge receipt immediately — Paystack expects a fast 200 response
        res.status(200).json({ received: true });

        console.log(data)

        if (event === 'charge.success') {
            const { reference, amount, status } = data;

            // 1. Find the transaction
            const transaction = await TransactionService.getTransactionByRef(reference);
            if (!transaction) {
                console.error(`Webhook: transaction not found for ref ${reference}`);
                return;
            }

            // 2. Guard against double processing
            if (transaction.status !== 'pending') {
                console.log(`Webhook: transaction ${reference} already processed`);
                return;
            }

            // 3. Update transaction status to successful
            await Transaction.findOneAndUpdate(
                { trans_ref: reference },
                { status: 'successful', data },
                { new: true }
            );

            // 4. Credit the wallet and create ledger entry
            await walletService.finalizeDeposit(
                transaction.user_id.toString(),
                amount,          // already in kobo from Paystack
                reference,
            );

            console.log(`Webhook: deposit finalized for ref ${reference}`);
        }

    } catch (error) {
        next(error);
    }
}
}

export default new TransactionController();