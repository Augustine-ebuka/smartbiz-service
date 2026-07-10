import { Request, Response, NextFunction } from 'express';
import billService from '../services/billService';
import {InitiatePaymentRequest} from '../utils/monnifyService';
class BillsController {

    async getBillerCategories(req: Request, res: Response, next: NextFunction) {
        try {
            const categories = await billService.getBillerCategories();
            res.status(200).json({
                status: 'success',
                message: 'Biller categories fetched successfully',
                data: categories,
            });
        } catch (error) {
            next(error);
        }
    }

    async getBillerProducts(req: Request, res: Response, next: NextFunction) {
        try {
            const { category_code } = req.params;
            const products = await billService.getBillerProducts(category_code);
            res.status(200).json({
                status: 'success',
                message: 'Biller products fetched successfully',
                data: products,
            });
        } catch (error) {
            next(error);
        }
    }

    async initiatePayment(req: Request, res: Response, next: NextFunction) {
        try {
            const paymentRequest: InitiatePaymentRequest = req.body;
            const paymentResponse = await billService.initiatePayment(paymentRequest);
            res.status(200).json({
                status: 'success',
                message: 'Bills initiated successfully',
                data: paymentResponse,
            });
        } catch (error) {
            console.log(error, "error..............")
            next(error);
        }
    }
    async getBillerProductDetails(req: Request, res: Response, next: NextFunction) {
        try {
            const { biller_code, category_code } = req.query as { biller_code: string, category_code: string };
            const productDetails = await billService.getBillerProductDetails(biller_code, category_code);
            res.status(200).json({
                status: 'success',
                message: 'Biller product details fetched successfully',
                data: productDetails,
            });
        } catch (error) {
            next(error);
        }
    }
    // Validate customer details
    async validateCustomer(req: Request, res: Response, next: NextFunction) {
        try {
            const { productCode, customerId } = req.body as { productCode: string, customerId: string };
            const validationResponse = await billService.validateCustomer({ productCode, customerId });
            res.status(200).json({
                status: 'success',
                message: 'Customer validation successful',
                data: validationResponse,
            });
        } catch (error) {
            next(error);
        }
    }
    // Get transaction status
    async getTransactionStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const { transactionReference } = req.query as { transactionReference: string };
            const transactionStatus = await billService.getTransactionStatus(transactionReference);
            res.status(200).json({
                status: 'success',
                message: 'Transaction status fetched successfully',
                data: transactionStatus,
            });
        } catch (error) {
            next(error);
        }
    }

    // Get biller code
    async getBillerCode(req: Request, res: Response, next: NextFunction) {
        try {
            const { category_code } = req.params;
            const billerCodes = await billService.getBillerCode(category_code);
            res.status(200).json({
                status: 'success',
                message: 'Biller codes fetched successfully',
                data: billerCodes,
            });
        } catch (error) {
            next(error);
        }
    }
}


export default new BillsController();