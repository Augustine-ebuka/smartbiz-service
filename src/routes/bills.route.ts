import express from 'express';
import billsController from '../controllers/billController';
import { authenticateToken } from '../middlewares/authMiddleware';
const router = express.Router();

/**
 * Route to fetch all biller categories from Monnify.
 * GET /api/v1/monnify/biller-categories
 */
router.get('/biller-categories', authenticateToken, billsController.getBillerCategories);

/**
 * Route to fetch all biller products from Monnify.
 * GET /api/v1/monnify/biller-products/:billerCode
 */
router.get('/biller-products/:category_code', authenticateToken, billsController.getBillerProducts);

/**
 * Route to initiate a payment using Monnify.
 * POST /api/v1/monnify/initiate-payment
 */
router.post('/initiate-payment', authenticateToken, billsController.initiatePayment);

/**
 * Route to fetch biller product details from Monnify.
 * GET /api/v1/monnify/biller-product-details/:billerCode
 */
router.get('/biller-product-details', authenticateToken, billsController.getBillerProductDetails);

/**
 * Route to validate customer details with Monnify.
 * POST /api/v1/monnify/validate-customer
 */
router.post('/validate-customer', authenticateToken, billsController.validateCustomer);

/**
 * Route to get transaction status with Monnify.
 * GET /api/v1/monnify/transaction-status/:transactionReference
 */
router.get('/transaction-status', authenticateToken, billsController.getTransactionStatus);

/**
 * Route to get biller code from Monnify.
 * GET /api/v1/monnify/biller-code/:category_code
 */
router.get('/biller-code/:category_code', authenticateToken, billsController.getBillerCode);

export default router;
