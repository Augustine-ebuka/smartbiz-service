import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const verifyPaystackWebhook = (req: Request, res: Response, next: NextFunction): void => {
    const secret = process.env.PAYSTACK_API_KEY!;
    const signature = req.headers['x-paystack-signature'] as string;

    if (!signature) {
        res.status(401).json({ success: false, message: 'No signature provided' });
        return;
    }

    // Paystack signs the raw body with HMAC SHA512
    const hash = crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (hash !== signature) {
        res.status(401).json({ success: false, message: 'Invalid signature' });
        return;
    }

    next();
};