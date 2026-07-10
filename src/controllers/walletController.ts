import { Request, Response } from 'express';
import AuthService from '../services/authService';
import WalletService from '../services/walletService';
import { breakPoint } from '../config/config';


class WalletController {
    async createWallet(req: Request, res: Response, next: any) {
        try {
            const { user_id } = req.body;
            const wallet = await WalletService.createWallet(user_id);
            res.status(201).json({
                message: 'Wallet created successfully',
                success: true,
                data: wallet,
            });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }
    
    async getWallet(req: Request, res: Response, next: any) {
        try {
            const { user_id } = req.params;
            const wallet = await WalletService.getWallet(user_id);
            res.status(200).json({
                message: 'Wallet retrieved successfully',
                success: true,
                data: wallet,
            });
        } catch (error: any) {
            res.status(404).json({ error: error.message });
        }
    }

    async deposit(req: Request, res: Response, next: any) {
        try {
            // breakPoint()
            const { amount } = req.body;
            const user_id = req.userId
            const wallet = await WalletService.deposit(user_id, amount);
            res.status(200).json({
                message: 'Wallet deposited successfully',
                success: true,
                data: wallet,
            });
        } catch (error: any) {
            console.log(error)
            res.status(400).json({ error: error.message });
        }
    }
    
    async withdraw(req: Request, res: Response, next: any) {
        try {
            const { user_id, amount } = req.body;
            const wallet = await WalletService.withdraw(user_id, amount);
            res.status(200).json({
                message: 'Wallet withdrawn successfully',
                success: true,
                data: wallet,
            });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    async getLedger(req: Request, res: Response, next: any) {
        try {
            const user_id = req.userId;
            const ledger = await WalletService.getLedger(user_id);
            res.status(200).json({
                success: true,
                message: 'Wallet ledger retrieved successfully',
                data: ledger,
            });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    async verifyTransaction(req: Request, res: Response, next: any) {
        try {
            const { reference } = req.body;
            const transaction = await WalletService.verifyPaystackTransaction(reference);
            res.status(200).json({
                success: true,
                message: 'Transaction verified successfully',
                data: transaction,
            });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

}

export default new WalletController();