import {User, IUser} from '../models/user.model';
import {Wallet, IWallet} from '../models/wallet.model';
import { WalletLedger } from '../models/walletLedger.model';
import ApiError from "../utils/ApiError";
import transactionService from './transactionService';
import { generateTransactionRef } from '../models/transaction.model';
import {createTransaction, verifyTransaction} from '../utils/paystackService';
import { APP_FRONTEND } from '../config/config';
import { ITransaction, Transaction } from '../models/transaction.model';
import { transferFunds } from '../utils/paystackService';
class WalletService {
    async createWallet(user_id: string) {
        try {
            const wallet = new Wallet({ user_id });
            await wallet.save();
            return wallet;
        } catch (error: any) {
            console.log(error)
            if (error.name === 'ValidationError' && error.message.includes('user_id')) {
                throw new ApiError(400, 'Wallet already exists for this user');
            }
            throw error;
        }
    }
    async getWallet(user_id: string) {
        try {
            const wallet = await Wallet.findOne({ user_id });
            if (!wallet) {
                throw new ApiError(404, 'Wallet not found');
            }
            return { balance: wallet.balance / 100 };
        } catch (error) {
            throw error;
        }
    }

    async deposit(user_id: string, amount: number) {
        try {
            const wallet = await Wallet.findOne({ user_id });
            if (!wallet) {
                throw new ApiError(404, 'Wallet not found');
            }

            // populate wallet user_id to use email
            await wallet.populate<{ user_id: IUser }>('user_id');

            // check if user has an email
            if (!(wallet.user_id as IUser).email) {
                throw new ApiError(400, 'User email not found');
            }

            // call paystack to initialize a transaction — DO NOT update balance yet
            const callbackUrl = APP_FRONTEND ? `${APP_FRONTEND.split(',')[0]}/transaction/callback` : `${process.env.BASE_URL}/transaction/callback`;

            const paystackTransaction = await createTransaction({
                email: (wallet.user_id as IUser).email,
                amount: amount * 100, // paystack expects amount in kobo
            });

            console.log(paystackTransaction)

            // Create transaction record as PENDING — balance updated only after webhook confirms
            const trans_ref = paystackTransaction.data.reference; // use paystack's reference
            await transactionService.createTransaction({
                user_id: user_id as any,
                type: 'deposit',
                status: 'pending',         // ✅ pending until webhook confirms
                amount: amount * 100,
                trans_ref,
                provider: 'paystack',                 // ✅ use paystack ref for easy webhook matching
            } as any);

            // ✅ return the paystack authorization URL for the user to complete payment
            return {
                authorization_url: paystackTransaction.data.authorization_url,
                reference: trans_ref,
            };

        } catch (error) {
            throw error;
        }
    }

    async withdraw(user_id: string, amount: number) {
        try {
            const amountKobo = amount * 100;
            
            // Atomically check balance and decrement
            const wallet = await Wallet.findOneAndUpdate(
                { user_id, balance: { $gte: amountKobo } },
                { $inc: { balance: -amountKobo } },
                { new: false } // Get the wallet state BEFORE the update
            );

            if (!wallet) {
                const existingWallet = await Wallet.findOne({ user_id });
                if (!existingWallet) {
                    throw new ApiError(404, 'Wallet not found');
                }
                throw new ApiError(400, 'Insufficient balance');
            }

            const balanceBefore = wallet.balance;
            const balanceAfter = wallet.balance - amountKobo;

            // Create transaction record
            const trans_ref = generateTransactionRef();
            await transactionService.createTransaction({
                user_id: user_id as any,
                type: 'purchase',
                status: 'successful',
                amount: amountKobo,
                trans_ref,
            } as any);

            // Create ledger entry
            await WalletLedger.create({
                wallet_id: wallet._id,
                type: 'debit',
                amount: amountKobo,
                balance_before: balanceBefore,
                balance_after: balanceAfter,
                reference: trans_ref,
                description: 'Wallet withdrawal / Purchase debit',
            });

            return { balance: balanceAfter / 100 };
        } catch (error) {
            throw error;
        }
    }
    async getLedger(user_id: string) {
        try {
            const wallet = await Wallet.findOne({ user_id });
            if (!wallet) {
                throw new ApiError(404, 'Wallet not found');
            }
            return await WalletLedger.find({ wallet_id: wallet._id }).sort({ created_at: -1 });
        } catch (error) {
            throw error;
        }
    }

    // async finalizeDeposit(user_id: string, amount: number, reference: string) {
    //     try {
    //         // Atomically increment the balance
    //         const wallet = await Wallet.findOneAndUpdate(
    //             { user_id },
    //             { $inc: { balance: amount } }, // amount is already in kobo
    //             { new: false } // Get the wallet state BEFORE the update
    //         );

    //         if (!wallet) {
    //             throw new ApiError(404, 'Wallet not found');
    //         }

    //         const balanceBefore = wallet.balance;
    //         const balanceAfter = wallet.balance + amount;

    //         // Create ledger entry
    //         await WalletLedger.create({
    //             wallet_id: wallet._id,
    //             type: 'credit',
    //             amount: amount,
    //             balance_before: balanceBefore,
    //             balance_after: balanceAfter,
    //             reference: reference,
    //             description: 'Wallet deposit credit',
    //         });

    //         return { balance: balanceAfter / 100 };
    //     } catch (error) {
    //         throw error;
    //     }
    // }

    // verify paystack transaction
    async verifyPaystackTransaction(reference: string) {
        try {
            const response = await verifyTransaction(reference);
            return response.data;
        } catch (error) {
            throw error;
        }
    }
    async finalizeDeposit(user_id: string, amount: number, trans_ref: string) {
    try {
        const wallet = await Wallet.findOne({ user_id });
        if (!wallet) {
            throw new ApiError(404, 'Wallet not found');
        }

        // Credit the wallet
        wallet.balance += amount;
        await wallet.save();

        // Create a ledger entry
        await WalletLedger.create({
            user_id,
            wallet_id: wallet._id,
            type: 'credit',
            amount,
            reference:trans_ref,
            description: 'Wallet deposit',
            balance_before: wallet.balance - amount,
            balance_after: wallet.balance,
        });

        return { balance: wallet.balance / 100 };
    } catch (error) {
        throw error;
    }
    }

//     async withdraw(user_id: string, amount: number) {

//   const wallet = await Wallet.findOne({ user_id });

//   if (!wallet || wallet.balance < amount) {
//     throw new Error("Insufficient balance");
//   }

//   // create pending transaction
//   const transaction = await Transaction.create({
//     user_id,
//     type: "withdrawal",
//     amount,
//     status: "pending"
//   });

//   // debit wallet immediately OR lock funds
//   await Wallet.updateOne(
//     { user_id },
//     { $inc: { balance: - amount * 100 } }
//   );

//   // send to paystack
// //   const transfer = await transferFunds({
// //     source: "balance",
// //     amount: amount * 100,
// //     recipient: user.recipient_code,
// //     reason: "Wallet withdrawal"
// //   });

//   // store transfer reference
//   transaction.trans_ref = transfer.data.data.reference;
//   await transaction.save();

//   return transfer.data;
// }
}

export default new WalletService();
